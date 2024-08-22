const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    let projectTimes = {};
    let statusBarItem;

    const projectFilePath = path.join(context.globalStorageUri.fsPath, 'project_times.json');

    // Загрузка сохраненных данных
    if (fs.existsSync(projectFilePath)) {
        const rawData = fs.readFileSync(projectFilePath, 'utf-8');
        projectTimes = JSON.parse(rawData);
    }

    const currentWorkspaceFolder = () => {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'default';
    };

    const startTracking = () => {
        const project = currentWorkspaceFolder();
        if (!projectTimes[project]) {
            projectTimes[project] = { totalTime: 0, lastStartTime: Date.now() };
        } else {
            projectTimes[project].lastStartTime = Date.now();
        }
        updateStatusBar();
    };

    const stopTracking = () => {
        const project = currentWorkspaceFolder();
        const projectData = projectTimes[project];
        if (projectData && projectData.lastStartTime) {
            projectData.totalTime += Date.now() - projectData.lastStartTime;
            projectData.lastStartTime = null;
        }
        updateStatusBar();
    };

    const saveData = () => {
        if (!fs.existsSync(context.globalStorageUri.fsPath)) {
            fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
        }
        fs.writeFileSync(projectFilePath, JSON.stringify(projectTimes, null, 2));
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

    // Обновление статус-бара каждую минуту
    setInterval(() => {
        updateStatusBar();
    }, 1000);

    // Команда для отображения статистики
    let disposable = vscode.commands.registerCommand('extension.showTimeStats', () => {
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

    context.subscriptions.push(disposable);

    // Сохранение данных при деактивации
    context.subscriptions.push({
        dispose: () => {
            stopTracking();
            saveData();
        },
    });
}

function deactivate() {
    // Не требуется, т.к. подписки автоматом выполнятся при деактивации
}

module.exports = {
    activate,
    deactivate
};
