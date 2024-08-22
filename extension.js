const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

function activate(context) {
    let projectTimes = {};
    let statusBarItem;

    // Инициализация папки VSTime в документах пользователя
    const documentsPath = path.join(os.homedir(), 'Documents');
    const vstimeFolderPath = path.join(documentsPath, 'VSTime');
    if (!fs.existsSync(vstimeFolderPath)) {
        fs.mkdirSync(vstimeFolderPath, { recursive: true });
    }

    const currentWorkspaceFolder = () => {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'default';
    };

    const startTracking = () => {
        const project = currentWorkspaceFolder();
        if (!projectTimes[project]) {
            projectTimes[project] = { totalTime: 0, lastStartTime: Date.now(), dailyTimes: {} };
        } else {
            projectTimes[project].lastStartTime = Date.now();
        }
        updateStatusBar();
    };

    const stopTracking = () => {
        const project = currentWorkspaceFolder();
        const projectData = projectTimes[project];
        if (projectData && projectData.lastStartTime) {
            const now = Date.now();
            const timeSpent = now - projectData.lastStartTime;
            projectData.totalTime += timeSpent;

            const today = new Date().toISOString().slice(0, 10); // Получаем текущую дату в формате YYYY-MM-DD
            if (!projectData.dailyTimes[today]) {
                projectData.dailyTimes[today] = 0;
            }
            projectData.dailyTimes[today] += timeSpent;

            projectData.lastStartTime = null;
        }
        saveProjectTimeToFile(project);
        updateStatusBar();
    };

    const updateStatusBar = () => {
        const project = currentWorkspaceFolder();
        const projectData = projectTimes[project];

        if (projectData) {
            const totalTime = Math.floor(projectData.totalTime / 1000); // Время в секундах
            statusBarItem.text = `$(clock) ${formatTime(totalTime)}`;
        } else {
            statusBarItem.text = `$(clock) No data`;
        }

        statusBarItem.show();
    };

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    };

    const saveProjectTimeToFile = (project) => {
        const projectData = projectTimes[project];
        if (projectData) {
            const totalTime = Math.floor(projectData.totalTime / 1000); // Время в секундах
            const formattedTime = formatTime(totalTime);

            // Создание имени файла на основе имени проекта
            const projectName = path.basename(project);
            const filePath = path.join(vstimeFolderPath, `${projectName}.md`);

            // Обновление или создание файла статистики
            const fileContent = `# Project: ${projectName}\n\n**Total Time Spent:** ${formattedTime}\n\n_Last updated: ${new Date().toLocaleString()}_\n\n## Daily Time Spent\n`;
            let dailyTimeContent = '';
            for (const [date, time] of Object.entries(projectData.dailyTimes)) {
                dailyTimeContent += `**${date}:** ${formatTime(Math.floor(time / 1000))}\n`;
            }
            fs.writeFileSync(filePath, fileContent + dailyTimeContent);
        }
    };

    // Создание элемента статус-бара
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    // Начало отслеживания при активации
    startTracking();

    // Обработчик смены рабочей области
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        stopTracking();
        startTracking();
    });

    // Обработчики открытия/закрытия окна
    vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
            startTracking();
        } else {
            stopTracking();
        }
    });

    // Обновление статус-бара каждую секунду
    setInterval(() => {
        updateStatusBar();
    }, 1000);

    // Команда для отображения статистики
    let showTimeStats = vscode.commands.registerCommand('extension.showTimeStats', () => {
        stopTracking();

        const project = currentWorkspaceFolder();
        const projectData = projectTimes[project];

        if (projectData) {
            const totalTime = Math.floor(projectData.totalTime / 1000); // Время в секундах
            vscode.window.showInformationMessage(`Вы провели ${formatTime(totalTime)} в проекте ${project}`);
        } else {
            vscode.window.showInformationMessage('Нет данных для текущего проекта.');
        }

        startTracking();
    });

    // Команда для открытия вкладки со статистикой
    let openStatsTab = vscode.commands.registerCommand('extension.openStatsTab', () => {
        const panel = vscode.window.createWebviewPanel(
            'projectTimeStats',
            'Project Time Statistics',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        const project = currentWorkspaceFolder();
        const projectData = projectTimes[project];
        const { labels, data } = getChartData(projectData);

        panel.webview.html = getWebviewContent(project, labels, data);
    });

    context.subscriptions.push(showTimeStats);
    context.subscriptions.push(openStatsTab);

    // Регистрация View в сайдбаре
    vscode.window.registerTreeDataProvider(
        'vstimeView',
        new VSTimeSidebarProvider(context)
    );

    // Сохранение данных при деактивации
    context.subscriptions.push({
        dispose: () => {
            stopTracking();
            saveProjectTimeToFile(currentWorkspaceFolder());
        },
    });
}

class VSTimeSidebarProvider {
    constructor(context) {
        this.context = context;
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        return [
            new vscode.TreeItem("Open Stats", vscode.TreeItemCollapsibleState.None)
        ];
    }

    resolveTreeItem(item) {
        if (item.label === "Open Stats") {
            vscode.commands.executeCommand('extension.openStatsTab');
        }
    }
}

function getChartData(projectData) {
    const labels = [];
    const data = [];

    if (projectData) {
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay())); // Начало недели
        today.setDate(today.getDate() + (6 - today.getDay())); // Конец недели

        for (let d = new Date(startOfWeek); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().slice(0, 10);
            labels.push(dateStr);
            data.push(Math.floor((projectData.dailyTimes[dateStr] || 0) / 1000)); // Время в секундах
        }
    }

    return { labels, data };
}

function getWebviewContent(project, labels, data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Time Statistics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
        }
        canvas {
            width: 100%;
            height: 400px;
        }
    </style>
</head>
<body>
    <h1>Time Statistics for Project: ${project}</h1>
    <canvas id="timeChart"></canvas>
    <script>
        const ctx = document.getElementById('timeChart').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(labels)},
                datasets: [{
                    label: 'Time Spent (seconds)',
                    data: ${JSON.stringify(data)},
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}

function deactivate() {
    // Не требуется, т.к. подписки автоматом выполнятся при деактивации
}

module.exports = {
    activate,
    deactivate
};
