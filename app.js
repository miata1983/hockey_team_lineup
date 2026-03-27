// Данные приложения
let team = [];
let games = [];
let currentGameId = null;
let deferredPrompt = null; // Для установки PWA

// Экранирование HTML для защиты от XSS
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
}

// Защита от двойного клика: возвращает false если прошло меньше delay мс с последнего вызова
function makeClickGuard(delay = 500) {
    let lastTime = 0;
    return function() {
        const now = Date.now();
        if (now - lastTime < delay) return false;
        lastTime = now;
        return true;
    };
}
const guardRemoveReady = makeClickGuard();
const guardRemoveLineup = makeClickGuard();

// Debounce для сохранения данных
let saveDataTimer = null;
function saveDataDebounced() {
    clearTimeout(saveDataTimer);
    saveDataTimer = setTimeout(saveData, 300);
}

// Утилита копирования в буфер обмена с fallback для старых браузеров
function copyToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        alert(successMsg);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            alert(successMsg);
        } catch (err) {
            alert('Не удалось скопировать. Текст выведен в консоль.');
            console.log(text);
        }
        document.body.removeChild(textarea);
    });
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initializeEventListeners();
    renderTeam();
    renderGamesList();
    updateHeaderView();
    
    // Регистрация service worker для PWA
    if ('serviceWorker' in navigator) {
        // Определяем правильный путь для Service Worker
        // Для GitHub Pages используем относительный путь от корня репозитория
        const swPath = location.pathname.includes('/hockey_team_lineup/') 
            ? '/hockey_team_lineup/service-worker.js' 
            : './service-worker.js';
        const swScope = location.pathname.includes('/hockey_team_lineup/') 
            ? '/hockey_team_lineup/' 
            : './';
        
        // Проверяем, что мы на HTTPS или localhost
        const isSecure = location.protocol === 'https:' || 
                        location.hostname === 'localhost' || 
                        location.hostname === '127.0.0.1' ||
                        location.hostname === '';
        
        if (!isSecure) {
            console.warn('⚠️ Service Worker требует HTTPS или localhost. Текущий протокол:', location.protocol);
        }
        
        navigator.serviceWorker.register(swPath, { 
            scope: swScope,
            updateViaCache: 'none'
        })
            .then(reg => {
                console.log('✅ Service Worker зарегистрирован:', reg.scope);
                // Сразу проверяем, нет ли новой версии SW на сервере
                reg.update();

                // Проверяем наличие иконок
                fetch('./icon-192.png').then(r => {
                    if (r.ok) {
                        console.log('✅ Иконка icon-192.png найдена');
                    } else {
                        console.error('❌ Иконка icon-192.png не найдена! Создайте её с помощью create-icons-simple.html');
                    }
                }).catch(() => {
                    console.error('❌ Иконка icon-192.png не найдена! Создайте её с помощью create-icons-simple.html');
                });
                
                fetch('./icon-512.png').then(r => {
                    if (r.ok) {
                        console.log('✅ Иконка icon-512.png найдена');
                    } else {
                        console.error('❌ Иконка icon-512.png не найдена! Создайте её с помощью create-icons-simple.html');
                    }
                }).catch(() => {
                    console.error('❌ Иконка icon-512.png не найдена! Создайте её с помощью create-icons-simple.html');
                });
                
                // При появлении новой версии SW — после активации страница перезагрузится (controllerchange)
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🔄 Новая версия приложения. Перезагрузка...');
                        }
                    });
                });
            })
            .catch(err => {
                console.error('❌ Ошибка регистрации Service Worker:', err);
                console.error('⚠️ PWA может не работать без Service Worker');
                console.error('💡 Откройте pwa-check.html для диагностики');
            });
        
        // После обновления SW перезагружаем страницу, чтобы подхватить новый код
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('🔄 Приложение обновлено, перезагрузка...');
            window.location.reload();
        });

        // При возврате во вкладку / открытии PWA — проверяем обновления на сервере
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update());
            }
        });
    } else {
        console.warn('⚠️ Service Worker не поддерживается в этом браузере');
    }
    
    // Инициализация PWA установки
    initPWAInstall();
});

// Обновление вида шапки в зависимости от экрана
function updateHeaderView() {
    const body = document.body;
    if (!body) return;

    const gameWorkSection = document.getElementById('gameWorkSection');
    const isHome = !currentGameId || !gameWorkSection || gameWorkSection.style.display === 'none';

    // Класс (для CSS)
    body.classList.toggle('home-view', isHome);

    // И прямое управление видимостью (надежнее для PWA/кэша стилей)
    const titleEl = document.getElementById('appTitle');
    const logoEl = document.getElementById('homeLogo');
    const homeTitleEl = document.getElementById('homeTitle');
    const headerActions = document.querySelector('header .header-actions');

    if (isHome) {
        if (titleEl) titleEl.style.display = 'none';
        if (headerActions) headerActions.style.display = 'none';
        if (logoEl) logoEl.style.display = 'flex';
        if (homeTitleEl) homeTitleEl.style.display = 'flex';
    } else {
        if (titleEl) titleEl.style.display = '';
        if (headerActions) headerActions.style.display = '';
        if (logoEl) logoEl.style.display = '';
        if (homeTitleEl) homeTitleEl.style.display = '';
    }
}

// Загрузка данных из localStorage
function loadData() {
    const savedTeam = localStorage.getItem('hockeyTeam');
    const savedGames = localStorage.getItem('hockeyGames');
    
    if (savedTeam) {
        team = JSON.parse(savedTeam);
    } else {
        // Начальный порядок игроков команды по умолчанию
        team = [
            { id: 1, name: 'Шеин Павел', number: 72, position: 'Вратарь' },
            { id: 2, name: 'Гулин Александр', number: 1, position: 'Вратарь' },
            { id: 3, name: 'Стаценко Денис', number: 1, position: 'Вратарь' },
            { id: 4, name: 'Юришин Михаил', number: 10, position: 'Нападающий' },
            { id: 5, name: 'Михайлов Георгий', number: 30, position: 'Нападающий' },
            { id: 6, name: 'Присяжный Григорий', number: 8, position: 'Нападающий' },
            { id: 7, name: 'Астахов Николай', number: 99, position: 'Нападающий' },
            { id: 8, name: 'Жевлаков Александр', number: 96, position: 'Нападающий' },
            { id: 9, name: 'Шипицин Вадим', number: 89, position: 'Нападающий' },
            { id: 10, name: 'Анпилогов Владимир', number: 79, position: 'Нападающий' },
            { id: 11, name: 'Киселев Сергей', number: 14, position: 'Нападающий' },
            { id: 12, name: 'Титов Андрей', number: 25, position: 'Нападающий' },
            { id: 13, name: 'Ким Александр', number: 9, position: 'Нападающий' },
            { id: 14, name: 'Базин Сергей', number: 52, position: 'Нападающий' },
            { id: 15, name: 'Ким Константин', number: 28, position: 'Нападающий' },
            { id: 16, name: 'Парубчак Иван', number: 13, position: 'Нападающий' },
            { id: 17, name: 'Мельников Михаил', number: 77, position: 'Нападающий' },
            { id: 18, name: 'Иунин Алексей', number: 80, position: 'Защитник' },
            { id: 19, name: 'Хон Дмитрий', number: 66, position: 'Защитник' },
            { id: 20, name: 'Воронин Вячеслав', number: 81, position: 'Защитник' },
            { id: 21, name: 'Ульянов Константин', number: 42, position: 'Защитник' },
            { id: 22, name: 'Гермаш Андрей', number: 39, position: 'Защитник' },
            { id: 23, name: 'Минякин Дмитрий', number: 84, position: 'Защитник' },
            { id: 24, name: 'Корховой Евгений', number: 91, position: 'Защитник' },
            { id: 25, name: 'Сергеев Дмитрий', number: 55, position: 'Нападающий' },
            { id: 26, name: 'Мията Виктор', number: 83, position: 'Защитник' },
            { id: 27, name: 'Хуторненко Олег', number: 70, position: 'Нападающий' },
            { id: 28, name: 'Захаров Денис', number: 23, position: 'Защитник' },
            { id: 29, name: 'Белинский Виталя', number: 0, position: 'Нападающий' },
        ];
    }
    
    if (savedGames) {
        games = JSON.parse(savedGames);
    }
}

// Сохранение данных в localStorage
function saveData() {
    localStorage.setItem('hockeyTeam', JSON.stringify(team));
    localStorage.setItem('hockeyGames', JSON.stringify(games));
}

// Получение текущей игры
function getCurrentGame() {
    return games.find(g => g.id === currentGameId);
}

// Создание новой игры
function createNewGame() {
    const newGame = {
        id: Date.now(),
        title: `Игра ${games.length + 1}`,
        date: new Date().toISOString().split('T')[0],
        time: '',
        weekday: '',
        stadium: '',
        score: '',
        points: '',
        color: '',
        playerStatuses: {}, // Статусы игроков: 'ready', 'not-ready' (Пас), 'doubtful' (Под ?), 'survey' (Опрос), null
        readyPlayers: Array(16).fill(null), // Список готовых играть (16 позиций)
        lineup: Array(16).fill(null) // Расстановка по пятеркам (16 позиций)
    };
    games.push(newGame);
    saveData();
    renderGamesList();
    selectGame(newGame.id);
    
    // Фокус на поле названия игры для быстрого редактирования
    setTimeout(() => {
        document.getElementById('gameTitle').focus();
        document.getElementById('gameTitle').select();
    }, 100);
}

// Выбор игры
function selectGame(gameId) {
    currentGameId = gameId;
    const game = getCurrentGame();
    if (!game) return;
    
    // Инициализируем playerStatuses если его нет
    if (!game.playerStatuses) {
        game.playerStatuses = {};
        saveData();
    }
    
    // Инициализируем новые поля если их нет
    if (game.time === undefined) game.time = '';
    if (game.weekday === undefined) game.weekday = '';
    if (game.stadium === undefined) game.stadium = '';
    if (game.points === undefined) game.points = '';
    if (game.color === undefined) game.color = '';
    
    // Заполняем информацию об игре
    document.getElementById('gameTitle').value = game.title;
    document.getElementById('gameDate').value = game.date;
    document.getElementById('gameTime').value = game.time || '';
    const weekdayEl = document.getElementById('gameWeekday');
    if (weekdayEl) {
        weekdayEl.value = game.weekday || '';
    }
    document.getElementById('gameStadium').value = game.stadium || '';
    document.getElementById('gameScore').value = game.score;
    const pointsEl = document.getElementById('gamePoints');
    if (pointsEl) {
        pointsEl.value = game.points || '';
    }
    const colorEl = document.getElementById('gameColor');
    if (colorEl) {
        colorEl.value = game.color || '';
    }
    
    // Скрываем список игр, показываем работу с игрой
    document.getElementById('gamesSection').style.display = 'none';
    document.getElementById('gameWorkSection').style.display = 'block';
    document.getElementById('saveAsJpegBtn').style.display = 'inline-block';
    
    // Показываем первый этап (формирование списка готовых)
    showStage1();
    // Мы больше не на стартовом экране — обновляем шапку (прячем логотип, показываем заголовок и кнопку добавления)
    updateHeaderView();
    // Обновляем вид шапки (для экрана игры показываем заголовок и кнопки)
    updateHeaderView();
}

// Показать этап 1: формирование списка готовых
function showStage1() {
    document.getElementById('stage1Section').style.display = 'block';
    document.getElementById('stage2Section').style.display = 'none';
    
    renderTeam();
    renderReadyPlayers();
    updateReadyCount();
}

// Показать этап 2: расстановка по звеньям
function showStage2() {
    const game = getCurrentGame();
    if (!game) return;
    
    // Проверяем, что выбрано хотя бы несколько игроков
    const readyCount = game.readyPlayers.filter(p => p !== null).length;
    if (readyCount === 0) {
        alert('Сначала выберите игроков в список готовых!');
        return;
    }
    
    document.getElementById('stage1Section').style.display = 'none';
    document.getElementById('stage2Section').style.display = 'block';
    
    renderReadyPlayersCompact();
    renderLineup();
    updateReadyCount2();
}

// Удаление игры
function deleteGame(gameId) {
    games = games.filter(g => g.id !== gameId);
    if (currentGameId === gameId) {
        currentGameId = null;
        // Показываем список игр, скрываем работу с игрой
        document.getElementById('gamesSection').style.display = 'block';
        document.getElementById('gameWorkSection').style.display = 'none';
        document.getElementById('saveAsJpegBtn').style.display = 'none';
        // Вернулись на стартовый экран — обновляем шапку (показываем логотип)
        updateHeaderView();
    }
    saveData();
    renderGamesList();
}

// Возврат к списку игр
function backToGames() {
    currentGameId = null;
    
    // Показываем список игр, скрываем работу с игрой
    document.getElementById('gamesSection').style.display = 'block';
    document.getElementById('gameWorkSection').style.display = 'none';
    document.getElementById('saveAsJpegBtn').style.display = 'none';
    
    // Обновляем список игр (чтобы убрать выделение)
    renderGamesList();
    // Возврат на домашний экран — обновляем шапку (показываем логотип, скрываем заголовок и кнопку добавления)
    updateHeaderView();
}

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Кнопка добавления игрока
    document.getElementById('addPlayerBtn').addEventListener('click', () => {
        document.getElementById('addPlayerModal').style.display = 'block';
    });

    // Кнопка создания новой игры
    document.getElementById('newGameBtn').addEventListener('click', () => {
        createNewGame();
    });
    
    // Кнопка перехода к расстановке
    document.getElementById('toLineupStageBtn').addEventListener('click', () => {
        showStage2();
    });
    
    // Кнопка назад к списку готовых
    document.getElementById('backToReadyBtn').addEventListener('click', () => {
        showStage1();
    });

    // Закрытие модальных окон
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            const modalId = closeBtn.getAttribute('data-modal');
            if (modalId) {
                closeModal(modalId);
            }
        });
    });

    // Закрытие модальных окон при клике вне их
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Форма добавления игрока
    document.getElementById('addPlayerForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addPlayer();
    });

    // Форма редактирования игрока
    document.getElementById('editPlayerForm').addEventListener('submit', (e) => {
        e.preventDefault();
        savePlayerEdit();
    });

    // Сохранение информации об игре
    document.getElementById('gameTitle').addEventListener('change', saveGameInfo);
    document.getElementById('gameDate').addEventListener('change', saveGameInfo);
    document.getElementById('gameTime').addEventListener('change', saveGameInfo);
    const gameWeekdayEl = document.getElementById('gameWeekday');
    if (gameWeekdayEl) {
        gameWeekdayEl.addEventListener('change', saveGameInfo);
    }
    document.getElementById('gameStadium').addEventListener('change', saveGameInfo);
    document.getElementById('gameScore').addEventListener('change', saveGameInfo);
    const gamePointsEl = document.getElementById('gamePoints');
    if (gamePointsEl) {
        gamePointsEl.addEventListener('change', saveGameInfo);
    }
    const gameColorEl = document.getElementById('gameColor');
    if (gameColorEl) {
        gameColorEl.addEventListener('change', saveGameInfo);
    }

    // Кнопка сохранения в JPEG
    document.getElementById('saveAsJpegBtn').addEventListener('click', () => {
        saveAsJpeg();
    });

    // Кнопка экспорта данных
    document.getElementById('exportDataBtn').addEventListener('click', () => {
        exportData();
    });

    // Кнопка импорта данных
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importDataModal').style.display = 'block';
    });

    // Кнопка копирования кода команды
    document.getElementById('copyTeamCodeBtn').addEventListener('click', () => {
        copyTeamCode();
    });

    // Кнопка копирования списка команды как текста
    const copyTeamTextBtn = document.getElementById('copyTeamTextBtn');
    if (copyTeamTextBtn) {
        copyTeamTextBtn.addEventListener('click', () => {
            copyTeamText();
        });
    }

    // Кнопка установки PWA
    const pwaInstallBtn = document.getElementById('pwaInstallBtn');
    if (pwaInstallBtn) {
        pwaInstallBtn.addEventListener('click', handlePWAInstall);
    }

    // Кнопка закрытия баннера PWA
    const pwaDismissBtn = document.getElementById('pwaDismissBtn');
    if (pwaDismissBtn) {
        pwaDismissBtn.addEventListener('click', () => {
            dismissPWAInstallBanner();
        });
    }

    // Кнопка показа установки PWA
    const showPWAInstallBtn = document.getElementById('showPWAInstallBtn');
    if (showPWAInstallBtn) {
        showPWAInstallBtn.addEventListener('click', () => {
            showPWAInstallManually();
        });
    }

    // Гамбургер-меню для служебных действий
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const headerMenu = document.getElementById('headerMenu');
    if (menuToggleBtn && headerMenu) {
        menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = headerMenu.classList.contains('open');
            headerMenu.classList.toggle('open', !isOpen);
        });

        // Закрытие меню при клике вне его
        document.addEventListener('click', (e) => {
            if (!headerMenu.contains(e.target) && !menuToggleBtn.contains(e.target)) {
                headerMenu.classList.remove('open');
            }
        });
    }

    // Drag-drop: delegation на контейнеры (вместо навешивания на каждый слот при рендере)
    const readyPlayersList = document.getElementById('readyPlayersList');
    readyPlayersList.addEventListener('dragstart', handleReadyPlayerDragStart);
    readyPlayersList.addEventListener('dragend', handleDragEnd);
    readyPlayersList.addEventListener('dragover', handleDragOver);
    readyPlayersList.addEventListener('drop', handleReadyDrop);
    readyPlayersList.addEventListener('dragleave', handleDragLeave);

    const readyPlayersList2 = document.getElementById('readyPlayersList2');
    readyPlayersList2.addEventListener('dragstart', handleReadyPlayerDragStart);
    readyPlayersList2.addEventListener('dragend', handleDragEnd);

    const goalieSlot = document.getElementById('goalieSlot');
    goalieSlot.addEventListener('dragover', handleDragOver);
    goalieSlot.addEventListener('drop', handleLineupDrop);
    goalieSlot.addEventListener('dragleave', handleDragLeave);

    const linesContainer = document.getElementById('linesContainer');
    linesContainer.addEventListener('dragover', handleDragOver);
    linesContainer.addEventListener('drop', handleLineupDrop);
    linesContainer.addEventListener('dragleave', handleDragLeave);

    // Подтверждение импорта данных
    document.getElementById('confirmImportBtn').addEventListener('click', () => {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput.files.length === 0) {
            alert('Выберите файл для импорта');
            return;
        }
        importData(fileInput.files[0]);
    });

    // Подтверждение удаления игры
    document.getElementById('confirmDeleteGameBtn').addEventListener('click', () => {
        const gameId = parseInt(document.getElementById('confirmDeleteGameBtn').dataset.gameId);
        if (gameId) {
            deleteGame(gameId);
            closeModal('deleteGameModal');
        }
    });

    // Подтверждение удаления игрока
    document.getElementById('confirmDeletePlayerBtn').addEventListener('click', () => {
        const playerId = parseInt(document.getElementById('confirmDeletePlayerBtn').dataset.playerId);
        if (playerId) {
            removePlayer(playerId);
            closeModal('deletePlayerModal');
        }
    });

    // Кнопка возврата к списку игр
    document.getElementById('backToGamesBtn').addEventListener('click', () => {
        backToGames();
    });
}

// Закрытие модального окна
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Сохранение информации об игре
function saveGameInfo() {
    const game = getCurrentGame();
    if (!game) return;
    
    game.title = document.getElementById('gameTitle').value || `Игра ${games.indexOf(game) + 1}`;
    const dateValue = document.getElementById('gameDate').value;
    game.date = dateValue || new Date().toISOString().split('T')[0];
    game.time = document.getElementById('gameTime').value;
    const weekdayEl = document.getElementById('gameWeekday');
    // Если есть дата, пытаемся автоматически определить день недели
    if (dateValue) {
        const d = new Date(dateValue + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            const weekdays = [
                'Воскресенье',
                'Понедельник',
                'Вторник',
                'Среда',
                'Четверг',
                'Пятница',
                'Суббота'
            ];
            const autoWeekday = weekdays[d.getDay()];
            game.weekday = autoWeekday;
            if (weekdayEl) {
                weekdayEl.value = autoWeekday;
            }
        } else {
            game.weekday = weekdayEl ? weekdayEl.value : '';
        }
    } else {
        game.weekday = weekdayEl ? weekdayEl.value : '';
    }
    game.stadium = document.getElementById('gameStadium').value;
    game.score = document.getElementById('gameScore').value;
    const pointsEl = document.getElementById('gamePoints');
    game.points = pointsEl ? pointsEl.value : '';
    const colorEl = document.getElementById('gameColor');
    game.color = colorEl ? colorEl.value : '';
    
    saveData();
    renderGamesList();
}

// Добавление игрока в команду
function addPlayer() {
    const name = document.getElementById('playerName').value;
    const number = parseInt(document.getElementById('playerNumber').value) || 0;
    const position = document.getElementById('playerPosition').value;

    if (!name.trim()) {
        alert('Введите имя игрока');
        return;
    }

    const newPlayer = {
        id: Date.now(),
        name: name.trim(),
        number: number,
        position: position
    };

    team.push(newPlayer);
    saveData();
    renderTeam();
    
    // Очистка формы и закрытие модального окна
    document.getElementById('addPlayerForm').reset();
    closeModal('addPlayerModal');
}

// Подтверждение удаления игрока
function deletePlayerConfirm(playerId) {
    const player = team.find(p => p.id === playerId);
    if (!player) return;
    
    // Обновляем сообщение в модальном окне
    const message = document.getElementById('deletePlayerMessage');
    message.textContent = `Вы уверены, что хотите удалить игрока "${player.name}" (№${player.number || '?'}) из команды? Он будет удален из всех игр. Это действие нельзя отменить.`;
    
    // Сохраняем ID игрока в кнопке
    document.getElementById('confirmDeletePlayerBtn').dataset.playerId = playerId;
    
    // Показываем модальное окно
    document.getElementById('deletePlayerModal').style.display = 'block';
}

// Удаление игрока из команды
function removePlayer(playerId) {
    team = team.filter(p => p.id !== playerId);
    
    // Удаляем из всех игр
    games.forEach(game => {
        game.readyPlayers = game.readyPlayers.map(slot => slot && slot.id === playerId ? null : slot);
        game.lineup = game.lineup.map(slot => slot && slot.id === playerId ? null : slot);
        
        // Удаляем статус игрока
        if (game.playerStatuses && game.playerStatuses[playerId]) {
            delete game.playerStatuses[playerId];
        }
    });
    
    saveData();
    renderTeam();
    if (currentGameId) {
        renderReadyPlayers();
        renderReadyPlayersCompact();
        renderLineup();
        updateReadyCount();
        updateReadyCount2();
    }
}

// Получение сокращенного названия позиции
function getPositionShort(position) {
    const map = {
        'Вратарь': 'Вр',
        'Нападающий': 'Нап',
        'Защитник': 'Защ'
    };
    return map[position] || position;
}

// Отображение списка команды
function renderTeam() {
    const game = getCurrentGame();
    if (!game) return;
    
    const teamList = document.getElementById('teamList');
    teamList.innerHTML = '';

    if (team.length === 0) {
        teamList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Команда пуста. Добавьте игроков.</p>';
        return;
    }

    // Инициализируем playerStatuses если его нет
    if (!game.playerStatuses) {
        game.playerStatuses = {};
    }

    // Разделяем игроков по статусам
    const passPlayers = [];
    const maybePlayers = [];
    const surveyPlayers = [];
    const noStatusPlayers = [];

    team.forEach(player => {
        const status = game.playerStatuses[player.id];
        if (status === 'not-ready') {
            // Пас
            passPlayers.push(player);
        } else if (status === 'doubtful') {
            // Под ?
            maybePlayers.push(player);
        } else if (status === 'survey') {
            // Опрос
            surveyPlayers.push(player);
        } else if (status !== 'ready') {
            // Без статуса (готовые не показываем в списке команды)
            noStatusPlayers.push(player);
        }
    });

    // Вспомогательная функция для отрисовки группы
    const renderGroup = (players, title, extraClass, allowRemoveFromStatus = false) => {
        if (!players.length) return;

        const header = document.createElement('div');
        header.className = `team-status-header ${extraClass}`;
        header.textContent = title;
        teamList.appendChild(header);

        // Нумерация внутри каждой группы начинается с 1
        let rowIndex = 1;

        players.forEach(player => {
            const status = game.playerStatuses[player.id] || null;
            const playerCard = document.createElement('div');
            playerCard.className = `player-card ${status === 'not-ready' ? 'not-ready' : ''} ${status === 'doubtful' ? 'doubtful' : ''} ${status === 'survey' ? 'survey' : ''}`;
            playerCard.dataset.playerId = player.id;

            const positionShort = getPositionShort(player.position);

            playerCard.innerHTML = `
                <div class="player-info">
                    <div class="player-row-index">${rowIndex++}</div>
                    <div class="player-number">${player.number || '?'}</div>
                    <div class="player-details">
                        <h3>${escapeHTML(player.name)}</h3>
                        <p>${escapeHTML(positionShort)}</p>
                    </div>
                </div>
                <div class="player-status-buttons">
                    <button class="status-btn status-survey ${status === 'survey' ? 'active' : ''}" 
                            onclick="setPlayerStatus(${player.id}, 'survey')" 
                            title="Опрос">Опрос</button>
                    <button class="status-btn status-ready ${status === 'ready' ? 'active' : ''}" 
                            onclick="setPlayerStatus(${player.id}, 'ready')" 
                            title="Готов">Готов</button>
                    <button class="status-btn status-doubtful ${status === 'doubtful' ? 'active' : ''}" 
                            onclick="setPlayerStatus(${player.id}, 'doubtful')" 
                            title="Под вопросом">Под ?</button>
                    <button class="status-btn status-not-ready ${status === 'not-ready' ? 'active' : ''}" 
                            onclick="setPlayerStatus(${player.id}, 'not-ready')" 
                            title="Пас">Пас</button>
                </div>
                <div class="player-actions">
                    <button class="btn-icon" onclick="editPlayer(${player.id})" title="Редактировать">✏️</button>
                    <button class="btn-icon" onclick="deletePlayerConfirm(${player.id})" title="Удалить из команды">🗑️</button>
                </div>
                ${allowRemoveFromStatus ? `<button class="remove-player" style="margin-top: 8px;" onclick="removeFromStatus(${player.id})">Удалить</button>` : ''}
            `;

            teamList.appendChild(playerCard);
        });
    };

    // Сначала без статуса
    renderGroup(noStatusPlayers, 'Без статуса', 'team-status-none', false);
    // Затем Опрос, Под ?, Пас — с возможностью удаления из списка (возврат в общий список)
    renderGroup(surveyPlayers, 'Опрос', 'team-status-survey', true);
    renderGroup(maybePlayers, 'Под ?', 'team-status-maybe', true);
    renderGroup(passPlayers, 'Пас', 'team-status-pass', true);
}

// Удаление игрока из списков "Опрос" / "Под ?" / "Пас" (возврат в общий список команды)
function removeFromStatus(playerId) {
    const game = getCurrentGame();
    if (!game) return;

    if (!game.playerStatuses) {
        game.playerStatuses = {};
    }

    // Сбрасываем статус игрока
    delete game.playerStatuses[playerId];

    // На всякий случай убираем из списков готовых и из расстановки
    if (Array.isArray(game.readyPlayers)) {
        game.readyPlayers = game.readyPlayers.map(slot => slot && slot.id === playerId ? null : slot);
    }
    if (Array.isArray(game.lineup)) {
        game.lineup = game.lineup.map(slot => slot && slot.id === playerId ? null : slot);
    }

    saveData();
    renderTeam();
    renderReadyPlayers();
    renderReadyPlayersCompact();
    renderLineup();
    updateReadyCount();
    updateReadyCount2();
}

// Установка статуса игрока
function setPlayerStatus(playerId, status) {
    const game = getCurrentGame();
    if (!game) return;

    if (!game.playerStatuses) {
        game.playerStatuses = {};
    }

    const player = team.find(p => p.id === playerId);
    if (!player) return;

    const oldStatus = game.playerStatuses[playerId];

    if (status === 'ready') {
        // Игрок готов - добавляем в список готовых
        game.playerStatuses[playerId] = 'ready';
        
        // Находим свободный слот в readyPlayers
        let slotIndex = -1;
        if (player.position === 'Вратарь') {
            // Вратарь идет в слот 0
            if (!game.readyPlayers[0]) {
                slotIndex = 0;
            }
        } else {
            // Полевые игроки идут в слоты 1-15
            for (let i = 1; i < 16; i++) {
                if (!game.readyPlayers[i]) {
                    slotIndex = i;
                    break;
                }
            }
        }

        if (slotIndex !== -1) {
            game.readyPlayers[slotIndex] = player;
        } else {
            alert('Список готовых играть полон (16 игроков). Сначала освободите место.');
            return;
        }

        // Удаляем из старого слота если был там
        if (oldStatus === 'ready') {
            const oldSlotIndex = game.readyPlayers.findIndex(p => p && p.id === playerId);
            if (oldSlotIndex !== -1) {
                game.readyPlayers[oldSlotIndex] = null;
            }
        }
    } else if (status === 'not-ready' || status === 'doubtful' || status === 'survey') {
        // Неготовые / под вопросом / опрос - убираем из готовых и состава, помечаем статус
        game.playerStatuses[playerId] = status;
        
        // Удаляем из readyPlayers если был там
        const slotIndex = game.readyPlayers.findIndex(p => p && p.id === playerId);
        if (slotIndex !== -1) {
            game.readyPlayers[slotIndex] = null;
        }
        
        // Удаляем из lineup если был там
        const lineupIndex = game.lineup.findIndex(p => p && p.id === playerId);
        if (lineupIndex !== -1) {
            game.lineup[lineupIndex] = null;
        }
    } else {
        // Сброс статуса
        delete game.playerStatuses[playerId];
        
        // Удаляем из readyPlayers если был там
        const slotIndex = game.readyPlayers.findIndex(p => p && p.id === playerId);
        if (slotIndex !== -1) {
            game.readyPlayers[slotIndex] = null;
        }
        
        // Удаляем из lineup если был там
        const lineupIndex = game.lineup.findIndex(p => p && p.id === playerId);
        if (lineupIndex !== -1) {
            game.lineup[lineupIndex] = null;
        }
    }

    saveData();
    renderTeam();
    renderReadyPlayers();
    renderReadyPlayersCompact();
    renderLineup();
    updateReadyCount();
    updateReadyCount2();
}

// Отображение списка игр
function renderGamesList() {
    const gamesList = document.getElementById('gamesList');
    gamesList.innerHTML = '';

    if (games.length === 0) {
        gamesList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Нет сохраненных игр. Создайте новую игру.</p>';
        return;
    }

    // Сортируем игры по дате (новые сверху)
    const sortedGames = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedGames.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = `game-item ${currentGameId === game.id ? 'active' : ''}`;
        
        // Формируем строку с датой и временем
        let dateTimeStr = game.date || 'Без даты';
        if (game.time) {
            dateTimeStr += ` ${game.time}`;
        }
        
        // Формируем блок счета и очков
        let scoreBlock = '';
        if (game.score) {
            let pointsHtml = '';
            if (game.points !== undefined && game.points !== '') {
                const pts = parseInt(game.points, 10);
                const ptsClass = pts === 0 ? 'game-item-points game-item-points-zero' : 'game-item-points game-item-points-positive';
                pointsHtml = ` / <span class="${ptsClass}">${escapeHTML(game.points)} оч</span>`;
            }
            scoreBlock = `<span class="game-item-score">${escapeHTML(game.score)}</span>${pointsHtml}`;
        }

        gameItem.innerHTML = `
            <div class="game-item-content" onclick="selectGame(${game.id})">
                <div class="game-item-title">${escapeHTML(game.title)}</div>
                <div class="game-item-meta">
                    <span class="game-item-date">${escapeHTML(dateTimeStr)}</span>
                    ${game.stadium ? `<span class="game-item-stadium">📍 ${escapeHTML(game.stadium)}</span>` : ''}
                    ${scoreBlock ? `<span class="game-item-score-wrapper">${scoreBlock}</span>` : ''}
                </div>
            </div>
            <div class="game-item-actions">
                <button class="btn-icon" onclick="event.stopPropagation(); deleteGameConfirm(${game.id})" title="Удалить">🗑️</button>
            </div>
        `;
        gamesList.appendChild(gameItem);
    });
}

// Подтверждение удаления игры
function deleteGameConfirm(gameId) {
    document.getElementById('confirmDeleteGameBtn').dataset.gameId = gameId;
    document.getElementById('deleteGameModal').style.display = 'block';
}

// Порядок отображения в "Готовые играть": вратарь, нападающие вверху, защитники внизу
function getReadyPlayersDisplayOrder(game) {
    const slots = game.readyPlayers.map((player, index) => ({ player, index }));
    const goalie = slots.filter(s => s.index === 0);
    const field = slots.filter(s => s.index >= 1);

    const forwards = [];
    const defenders = [];
    const other = [];
    const emptyField = [];

    field.forEach(s => {
        if (!s.player) {
            emptyField.push(s);
            return;
        }
        const posShort = getPositionShort(s.player.position); // 'Вр', 'Нап', 'Защ'
        if (posShort === 'Нап') {
            forwards.push(s);
        } else if (posShort === 'Защ') {
            defenders.push(s);
        } else {
            other.push(s);
        }
    });

    forwards.sort((a, b) => a.index - b.index);
    defenders.sort((a, b) => a.index - b.index);
    other.sort((a, b) => a.index - b.index);
    emptyField.sort((a, b) => a.index - b.index);

    return [...goalie, ...forwards, ...defenders, ...other, ...emptyField];
}

// Отображение списка готовых играть игроков (16 позиций) - этап 1
function renderReadyPlayers() {
    const game = getCurrentGame();
    if (!game) return;

    const readyList = document.getElementById('readyPlayersList');
    readyList.innerHTML = '';

    const displayOrder = getReadyPlayersDisplayOrder(game);
    let displayNumber = 0;

    displayOrder.forEach(({ player, index }) => {
        const slot = document.createElement('div');
        slot.className = `ready-player-slot ${player ? 'filled' : 'empty'}`;
        slot.dataset.slotIndex = index;

        // Для вратаря (слот 0) не показываем порядковый номер
        if (index !== 0) {
            displayNumber++;
            const slotNumber = document.createElement('div');
            slotNumber.className = 'ready-slot-number';
            slotNumber.textContent = displayNumber;
            slot.appendChild(slotNumber);
        }

        const slotContent = document.createElement('div');
        slotContent.className = 'ready-slot-content';

        if (player) {
            const positionShort = getPositionShort(player.position);
            slotContent.innerHTML = `
                <div class="ready-player-info" draggable="true" data-player-id="${player.id}" data-from-ready="true">
                    <div class="player-number">${player.number || '?'}</div>
                    <div class="player-details">
                        <h3>${escapeHTML(player.name)}</h3>
                        <p>${escapeHTML(positionShort)}</p>
                    </div>
                </div>
                <button class="remove-player" onclick="removeFromReady(${index})" style="margin-top: 8px;">Удалить</button>
            `;
            
        } else {
            if (index === 0) {
                slotContent.innerHTML = `<div class="empty">Вратарь</div>`;
            } else {
                slotContent.innerHTML = `<div class="empty"></div>`;
            }
        }

        slot.appendChild(slotContent);
        readyList.appendChild(slot);
    });
}

// Отображение списка готовых (компактно) - этап 2
function renderReadyPlayersCompact() {
    const game = getCurrentGame();
    if (!game) return;

    const readyList = document.getElementById('readyPlayersList2');
    readyList.innerHTML = '';

    const playersData = [];
    game.readyPlayers.forEach((player, index) => {
        if (!player) return;
        const isInLineup = game.lineup.some(slot => slot && slot.id === player.id);
        const posShort = getPositionShort(player.position); // 'Вр', 'Нап', 'Защ'
        playersData.push({ player, index, isInLineup, posShort });
    });

    // Сортируем: не в составе выше; внутри группы — нападающие вверху, защитники внизу
    const posOrder = { 'Вр': 0, 'Нап': 1, 'Защ': 2 };
    playersData.sort((a, b) => {
        if (a.isInLineup !== b.isInLineup) return a.isInLineup ? 1 : -1;
        const posA = posOrder[a.posShort] ?? 1;
        const posB = posOrder[b.posShort] ?? 1;
        if (posA !== posB) return posA - posB;
        return a.index - b.index;
    });

    // Рендерим отсортированный список (нападающие вверху, защитники внизу)
    playersData.forEach(({ player, index, isInLineup }, displayIdx) => {
        const playerCard = document.createElement('div');
        playerCard.className = `ready-player-card ${isInLineup ? 'in-lineup' : ''}`;
        playerCard.draggable = !isInLineup;
        playerCard.dataset.playerId = player.id;

        const positionShort = getPositionShort(player.position);

        playerCard.innerHTML = `
            <div class="ready-player-compact-number">${displayIdx + 1}</div>
            <div class="player-number">${escapeHTML(player.number || '?')}</div>
            <div class="player-details">
                <h3>${escapeHTML(player.name)}</h3>
                <p>${escapeHTML(positionShort)}</p>
            </div>
            ${isInLineup ? '<div class="in-lineup-badge">✓</div>' : ''}
        `;

        readyList.appendChild(playerCard);
    });
}

// Отображение состава (расстановка по пятеркам)
function renderLineup() {
    const game = getCurrentGame();
    if (!game) return;

    renderGoalieSlot();
    renderLines();
}

// Отображение слота вратаря
function renderGoalieSlot() {
    const game = getCurrentGame();
    if (!game) return;

    const goalieSlot = document.getElementById('goalieSlot');
    goalieSlot.innerHTML = '';
    goalieSlot.dataset.slotIndex = 0;
    goalieSlot.className = `lineup-slot goalie-slot ${game.lineup[0] ? 'filled' : 'empty'}`;

    const slotContent = document.createElement('div');
    slotContent.className = 'lineup-slot-content';

    if (game.lineup[0]) {
        const player = game.lineup[0];
        const positionShort = getPositionShort(player.position);
        slotContent.innerHTML = `
            <div class="lineup-slot-player">
                <div class="player-info">
                    <div class="player-number">${player.number || '?'}</div>
                    <div class="player-details">
                        <h3>${escapeHTML(player.name)}</h3>
                        <p>${escapeHTML(positionShort)}</p>
                    </div>
                </div>
                <button class="remove-player" onclick="removeFromLineup(0)">Удалить</button>
            </div>
        `;
    } else {
        // Если вратарь не выбран, показываем подсказку и выпадающий список
        // для выбора из списка готовых вратарей
        const availableGoalies = game.readyPlayers.filter(p => p && p.position === 'Вратарь' && !game.lineup.some(lp => lp && lp.id === p.id));

        const optionsHtml = availableGoalies.map(p => `
            <option value="${p.id}">${p.number || '?'} — ${p.name}</option>
        `).join('');

        slotContent.innerHTML = `
            <div class="empty-slot-select">
                <div class="empty">Вратарь</div>
                <select class="lineup-select" onchange="handleLineupSelect(0, this.value)">
                    <option value="">Выбрать из готовых</option>
                    ${optionsHtml}
                </select>
            </div>
        `;
    }

    goalieSlot.appendChild(slotContent);
}

// Отображение трех звеньев
function renderLines() {
    const game = getCurrentGame();
    if (!game) return;

    const linesContainer = document.getElementById('linesContainer');
    linesContainer.innerHTML = '';

    for (let lineNum = 1; lineNum <= 3; lineNum++) {
        const lineStart = (lineNum - 1) * 5 + 1;
        const forwardsStart = lineStart;
        const defendersStart = lineStart + 3;

        const lineDiv = document.createElement('div');
        lineDiv.className = 'hockey-line';
        lineDiv.innerHTML = `<h4>${lineNum} звено</h4>`;

        // Нападающие и защитники в одной строке
        const playersContainer = document.createElement('div');
        playersContainer.className = 'line-players-grid';

        for (let i = forwardsStart; i < lineStart + 5; i++) {
            playersContainer.appendChild(createFieldSlot(i, i < defendersStart ? 'Нап' : 'Защ'));
        }
        
        lineDiv.appendChild(playersContainer);
        linesContainer.appendChild(lineDiv);
    }
}

// Создание слота для полевого игрока
function createFieldSlot(index, expectedPosition) {
    const game = getCurrentGame();
    if (!game) return document.createElement('div');

    const slot = document.createElement('div');
    slot.className = `lineup-slot field-slot ${game.lineup[index] ? 'filled' : 'empty'}`;
    slot.dataset.slotIndex = index;

    const slotContent = document.createElement('div');
    slotContent.className = 'lineup-slot-content';

    if (game.lineup[index]) {
        const player = game.lineup[index];
        const positionShort = getPositionShort(player.position);
        slotContent.innerHTML = `
            <div class="lineup-slot-player">
                <div class="player-info">
                    <div class="player-number">${player.number || '?'}</div>
                    <div class="player-details">
                        <h3>${escapeHTML(player.name)}</h3>
                        <p>${escapeHTML(positionShort)}</p>
                    </div>
                </div>
                <button class="remove-player" onclick="removeFromLineup(${index})">Удалить</button>
            </div>
        `;
    } else {
        // Пустой слот: показываем ожидаемую позицию и выпадающий список
        // для выбора игрока из списка готовых
        const usedIds = new Set(game.lineup.filter(p => p).map(p => p.id));
        const availablePlayers = game.readyPlayers.filter(p => {
            if (!p) return false;
            if (usedIds.has(p.id)) return false;
            // Вратаря можно ставить только в слот 0
            if (index !== 0 && p.position === 'Вратарь') return false;
            return true;
        });

        const optionsHtml = availablePlayers.map(p => `
            <option value="${p.id}">${p.number || '?'} — ${p.name}</option>
        `).join('');

        slotContent.innerHTML = `
            <div class="empty-slot-select">
                <div class="empty">${expectedPosition}</div>
                <select class="lineup-select" onchange="handleLineupSelect(${index}, this.value)">
                    <option value="">Выбрать из готовых</option>
                    ${optionsHtml}
                </select>
            </div>
        `;
    }

    slot.appendChild(slotContent);
    return slot;
}

// Выбор игрока в слот расстановки из выпадающего списка
function handleLineupSelect(slotIndex, playerIdValue) {
    const game = getCurrentGame();
    if (!game) return;

    const playerId = parseInt(playerIdValue, 10);
    if (!playerId) return;

    const player = game.readyPlayers.find(p => p && p.id === playerId);
    if (!player) {
        alert('Игрок не найден в списке готовых.');
        return;
    }

    // Проверяем, не занят ли игрок уже в составе
    if (game.lineup.some(p => p && p.id === player.id)) {
        alert('Этот игрок уже в составе!');
        return;
    }

    // Проверка позиции только для слота вратаря
    if (slotIndex === 0 && player.position !== 'Вратарь') {
        alert('В эту позицию можно добавить только вратаря!');
        return;
    }

    // Вратаря нельзя ставить в полевой слот
    if (slotIndex !== 0 && player.position === 'Вратарь') {
        alert('Вратарь может быть только в позиции вратаря.');
        return;
    }

    // Добавляем игрока в слот
    game.lineup[slotIndex] = player;
    saveData();
    renderLineup();
    renderReadyPlayersCompact();
}

// Обновление счетчика готовых игроков
function updateReadyCount() {
    const game = getCurrentGame();
    if (!game) return;
    const filled = game.readyPlayers.filter(slot => slot !== null).length;
    const readyCountEl = document.getElementById('readyCount');
    if (readyCountEl) {
        readyCountEl.textContent = `${filled}/16`;
    }
}

// Обновление счетчика готовых игроков (этап 2)
function updateReadyCount2() {
    const game = getCurrentGame();
    if (!game) return;
    const filled = game.readyPlayers.filter(slot => slot !== null).length;
    const readyCountEl = document.getElementById('readyCount2');
    if (readyCountEl) {
        readyCountEl.textContent = `${filled}/16`;
    }
}

// Drag and Drop обработчики
let draggedPlayer = null;
let draggedFromReady = false;

// Перетаскивание из списка готовых
function handleReadyPlayerDragStart(e) {
    e.stopPropagation();
    const game = getCurrentGame();
    if (!game) {
        e.preventDefault();
        return;
    }

    const draggable = e.target.closest('[data-player-id][data-from-ready]');
    if (!draggable) {
        e.preventDefault();
        return;
    }

    const playerId = parseInt(draggable.dataset.playerId);
    if (!playerId) {
        e.preventDefault();
        return;
    }

    draggedPlayer = game.readyPlayers.find(p => p && p.id === playerId);
    if (!draggedPlayer) {
        e.preventDefault();
        return;
    }
    
    draggedFromReady = true;
    draggable.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', playerId.toString());
    document.body.style.overflow = 'hidden';
}

function handleDragEnd(e) {
    const draggable = e.target.closest('[data-player-id]');
    if (draggable) draggable.classList.remove('dragging');
    document.body.style.overflow = '';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();

    const slot = e.target.closest('.lineup-slot, .ready-player-slot');
    if (!slot) return;

    const slotIndex = parseInt(slot.dataset.slotIndex);

    if (draggedPlayer) {
        if (slotIndex === 0 && draggedPlayer.position !== 'Вратарь') {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        if (slotIndex > 0 && draggedPlayer.position === 'Вратарь') {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        if (!draggedFromReady && slot.classList.contains('lineup-slot')) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
    }

    e.dataTransfer.dropEffect = 'move';
    if (!slot.classList.contains('filled')) {
        slot.classList.add('drag-over');
    }
}

function handleReadyDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    const slot = e.target.closest('.ready-player-slot');
    if (!slot) return;

    slot.classList.remove('drag-over');

    if (!draggedPlayer) return;

    const game = getCurrentGame();
    if (!game) return;

    const slotIndex = parseInt(slot.dataset.slotIndex);
    
    // Проверяем, не занят ли игрок уже в списке готовых
    if (game.readyPlayers.some(s => s && s.id === draggedPlayer.id)) {
        alert('Этот игрок уже в списке готовых играть!');
        return;
    }

    // Проверка позиции для слота вратаря
    if (slotIndex === 0 && draggedPlayer.position !== 'Вратарь') {
        alert('В эту позицию можно добавить только вратаря!');
        return;
    }

    // Проверка позиции для полевых игроков
    if (slotIndex > 0 && draggedPlayer.position === 'Вратарь') {
        alert('Вратаря можно добавить только в первую позицию!');
        return;
    }

    // Проверяем, не занят ли слот другим игроком
    if (game.readyPlayers[slotIndex]) {
        alert('Этот слот уже занят! Сначала освободите его.');
        return;
    }

    // Добавляем игрока в слот
    game.readyPlayers[slotIndex] = draggedPlayer;
    saveData();
    renderReadyPlayers();
    renderReadyPlayersCompact();
    renderLineup();
    renderTeam();
    updateReadyCount();
    updateReadyCount2();

    draggedPlayer = null;
    return false;
}

function handleLineupDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    const slot = e.target.closest('.lineup-slot, .ready-player-slot');
    if (!slot) return;

    slot.classList.remove('drag-over');

    if (!draggedPlayer) return;

    const game = getCurrentGame();
    if (!game) return;

    const slotIndex = parseInt(slot.dataset.slotIndex);
    
    // Если это слот из списка готовых (ready-player-slot)
    if (slot.classList.contains('ready-player-slot')) {
        // Проверяем, что игрок в списке готовых
        if (!game.readyPlayers.some(s => s && s.id === draggedPlayer.id)) {
            alert('Сначала добавьте игрока в список готовых играть!');
            draggedPlayer = null;
            draggedFromReady = false;
            return false;
        }
        
        // Перемещаем игрока в другой слот готовых
        const currentSlotIndex = game.readyPlayers.findIndex(p => p && p.id === draggedPlayer.id);
        if (currentSlotIndex !== -1 && currentSlotIndex !== slotIndex) {
            // Проверяем позицию
            if (slotIndex === 0 && draggedPlayer.position !== 'Вратарь') {
                alert('В первую позицию можно добавить только вратаря!');
                draggedPlayer = null;
                draggedFromReady = false;
                return false;
            }
            if (slotIndex > 0 && draggedPlayer.position === 'Вратарь') {
                alert('Вратаря можно добавить только в первую позицию!');
                draggedPlayer = null;
                draggedFromReady = false;
                return false;
            }
            
            // Если целевой слот занят другим игроком — меняем местами
            const displaced = game.readyPlayers[slotIndex];
            game.readyPlayers[currentSlotIndex] = displaced || null;
            game.readyPlayers[slotIndex] = draggedPlayer;
            saveData();
            renderReadyPlayers();
            renderReadyPlayersCompact();
            updateReadyCount();
            updateReadyCount2();
        }
        
        draggedPlayer = null;
        draggedFromReady = false;
        return false;
    }
    
    // Если это слот расстановки (lineup-slot)
    // Проверяем, что игрок в списке готовых
    if (!game.readyPlayers.some(s => s && s.id === draggedPlayer.id)) {
        alert('Сначала добавьте игрока в список готовых играть!');
        draggedPlayer = null;
        draggedFromReady = false;
        return false;
    }
    
    // Проверяем, не занят ли игрок уже в составе
    if (game.lineup.some(s => s && s.id === draggedPlayer.id)) {
        alert('Этот игрок уже в составе!');
        draggedPlayer = null;
        draggedFromReady = false;
        return false;
    }

    // Проверка позиции только для слота вратаря
    if (slotIndex === 0 && draggedPlayer.position !== 'Вратарь') {
        alert('В эту позицию можно добавить только вратаря!');
        draggedPlayer = null;
        draggedFromReady = false;
        return false;
    }

    // Проверяем, не занят ли слот в расстановке
    if (game.lineup[slotIndex]) {
        alert('Этот слот уже занят! Сначала уберите игрока из позиции.');
        draggedPlayer = null;
        draggedFromReady = false;
        return false;
    }

    // Добавляем игрока в слот
    game.lineup[slotIndex] = draggedPlayer;
    saveData();
    renderLineup();
    renderReadyPlayersCompact();

    draggedPlayer = null;
    draggedFromReady = false;
    return false;
}

function handleDragLeave(e) {
    const slot = e.target.closest('.lineup-slot, .ready-player-slot');
    if (slot && !slot.contains(e.relatedTarget)) {
        slot.classList.remove('drag-over');
    }
}


// Удаление игрока из списка готовых
function removeFromReady(slotIndex) {
    if (!guardRemoveReady()) return;
    const game = getCurrentGame();
    if (!game) return;

    // Сохраняем игрока перед удалением
    const removedPlayer = game.readyPlayers[slotIndex];
    
    // Удаляем из списка готовых
    game.readyPlayers[slotIndex] = null;
    
    // Сбрасываем статус игрока
    if (removedPlayer && game.playerStatuses) {
        delete game.playerStatuses[removedPlayer.id];
    }
    
    // Удаляем из состава, если он там есть
    if (removedPlayer) {
        game.lineup = game.lineup.map(slot => slot && slot.id === removedPlayer.id ? null : slot);
    }
    
    saveData();
    renderTeam();
    renderReadyPlayers();
    renderReadyPlayersCompact();
    renderLineup();
    updateReadyCount();
    updateReadyCount2();
}


// Удаление игрока из состава
function removeFromLineup(slotIndex) {
    if (!guardRemoveLineup()) return;
    const game = getCurrentGame();
    if (!game) return;

    game.lineup[slotIndex] = null;
    saveData();
    renderLineup();
    renderReadyPlayersCompact();
}

// Редактирование игрока
function editPlayer(playerId) {
    const player = team.find(p => p.id === playerId);
    if (!player) return;

    // Заполняем форму данными игрока
    document.getElementById('editPlayerId').value = player.id;
    document.getElementById('editPlayerName').value = player.name;
    document.getElementById('editPlayerNumber').value = player.number || '';
    document.getElementById('editPlayerPosition').value = player.position;

    // Открываем модальное окно
    document.getElementById('editPlayerModal').style.display = 'block';
}

// Сохранение изменений игрока
function savePlayerEdit() {
    const playerId = parseInt(document.getElementById('editPlayerId').value);
    const name = document.getElementById('editPlayerName').value;
    const number = parseInt(document.getElementById('editPlayerNumber').value) || 0;
    const position = document.getElementById('editPlayerPosition').value;

    if (!name.trim()) {
        alert('Введите имя игрока');
        return;
    }

    // Находим игрока в команде
    const playerIndex = team.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    // Обновляем данные игрока
    team[playerIndex].name = name.trim();
    team[playerIndex].number = number;
    team[playerIndex].position = position;

    // Обновляем игрока во всех играх
    games.forEach(game => {
        game.readyPlayers = game.readyPlayers.map(slot => {
            if (slot && slot.id === playerId) {
                return { ...team[playerIndex] };
            }
            return slot;
        });
        game.lineup = game.lineup.map(slot => {
            if (slot && slot.id === playerId) {
                return { ...team[playerIndex] };
            }
            return slot;
        });
    });

    saveData();
    renderTeam();
    if (currentGameId) {
        renderReadyPlayers();
        renderReadyPlayersCompact();
        renderLineup();
    }
    
    // Закрываем модальное окно
    closeModal('editPlayerModal');
}

// Сохранение состава в JPEG формате A4
async function saveAsJpeg() {
    const game = getCurrentGame();
    if (!game) {
        alert('Выберите игру для сохранения');
        return;
    }

    try {
        // Показываем индикатор загрузки
        const btn = document.getElementById('saveAsJpegBtn');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Генерация...';
        btn.disabled = true;

        // Получаем контейнеры
        const exportContainer = document.getElementById('exportContainer');
        const exportContent = document.getElementById('exportContent');
        
        // Генерируем HTML контент
        exportContent.innerHTML = generateExportHTML(game);
        
        // Показываем контейнер (но вне видимости)
        exportContainer.style.display = 'block';
        exportContainer.style.visibility = 'visible';
        exportContainer.style.opacity = '1';

        // Ждем достаточно времени для полного рендеринга всех элементов
        await new Promise(resolve => setTimeout(resolve, 500));

        // На мобильных устройствах уменьшаем разрешение для экономии памяти
        const isMobile = window.innerWidth < 768;
        const exportWidth = isMobile ? 1240 : 2480;
        const exportHeight = isMobile ? 1754 : 3508;

        // Используем html2canvas для создания изображения
        const canvas = await html2canvas(exportContent, {
            width: exportWidth,
            height: exportHeight,
            scale: 1,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            allowTaint: false,
            removeContainer: false,
            imageTimeout: 15000,
            onclone: (clonedDoc) => {
                const clonedContent = clonedDoc.getElementById('exportContent');
                if (clonedContent) {
                    clonedContent.style.display = 'flex';
                    clonedContent.style.visibility = 'visible';
                    clonedContent.style.opacity = '1';
                }
            }
        });

        // Скрываем контейнер обратно
        exportContainer.style.display = 'none';
        exportContainer.style.visibility = 'hidden';

        // Конвертируем canvas в blob и скачиваем
        canvas.toBlob((blob) => {
            if (!blob) {
                throw new Error('Не удалось создать изображение');
            }
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const safeTitle = (game.title || 'lineup').replace(/[^\wа-яА-ЯёЁ\s-]/g, '').trim();
            link.download = `hockey-lineup-${safeTitle}-${game.date || 'no-date'}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Восстанавливаем кнопку
            btn.textContent = originalText;
            btn.disabled = false;
        }, 'image/jpeg', 0.95);

    } catch (error) {
        console.error('Ошибка при сохранении:', error);
        alert('Произошла ошибка при сохранении изображения: ' + error.message);
        
        // Скрываем контейнер в случае ошибки
        const exportContainer = document.getElementById('exportContainer');
        if (exportContainer) {
            exportContainer.style.display = 'none';
        }
        
        const btn = document.getElementById('saveAsJpegBtn');
        btn.textContent = '💾 Сохранить как JPEG';
        btn.disabled = false;
    }
}

// Генерация HTML для экспорта
function generateExportHTML(game) {
    // Список игроков слева: вратарь первый, затем нападающие по возрастанию номера, затем защитники по возрастанию номера
    const allReady = game.readyPlayers.filter(p => p !== null);
    const goalies = allReady.filter(p => getPositionShort(p.position) === 'Вр').sort((a, b) => (a.number || 0) - (b.number || 0));
    const forwards = allReady.filter(p => getPositionShort(p.position) === 'Нап').sort((a, b) => (a.number || 0) - (b.number || 0));
    const defenders = allReady.filter(p => getPositionShort(p.position) === 'Защ').sort((a, b) => (a.number || 0) - (b.number || 0));
    const readyPlayersList = [...goalies, ...forwards, ...defenders];

    let listHTML = '';
    if (readyPlayersList.length === 0) {
        listHTML = '<div class="export-list-item"><span class="export-list-name">Состав пуст</span></div>';
    } else {
        listHTML = readyPlayersList.map((player, index) => {
            const positionShort = getPositionShort(player.position);
            const showPosition = positionShort === 'Вр' ? positionShort : '';
            return `
            <div class="export-list-item">
                <span class="export-list-order">${index + 1}</span>
                <span class="export-list-number">${player.number || '?'}</span>
                <span class="export-list-name">${escapeHTML(player.name)}</span>
                ${showPosition ? `<span class="export-list-position">${showPosition}</span>` : ''}
            </div>
        `;
        }).join('');
    }

    // Генерация схемы пятерок
    let linesHTML = '';
    for (let lineNum = 1; lineNum <= 3; lineNum++) {
        const lineStart = (lineNum - 1) * 5 + 1;
        const forwardsStart = lineStart;
        const defendersStart = lineStart + 3;

        let forwardsHTML = '';
        for (let i = forwardsStart; i < defendersStart; i++) {
            const player = game.lineup[i];
            if (player) {
                const positionShort = getPositionShort(player.position);
                const showPosition = positionShort === 'Вр' ? `<div class="export-field-position">${positionShort}</div>` : '';
                forwardsHTML += `
                    <div class="export-field-slot">
                        <div class="export-field-info">
                            <div class="export-field-number">${player.number || '?'}</div>
                            <div class="export-field-name">${escapeHTML(player.name)}</div>
                            ${showPosition}
                        </div>
                    </div>
                `;
            } else {
                forwardsHTML += `<div class="export-field-slot empty">Пусто</div>`;
            }
        }

        let defendersHTML = '';
        for (let i = defendersStart; i < lineStart + 5; i++) {
            const player = game.lineup[i];
            if (player) {
                const positionShort = getPositionShort(player.position);
                const showPosition = positionShort === 'Вр' ? `<div class="export-field-position">${positionShort}</div>` : '';
                defendersHTML += `
                    <div class="export-field-slot">
                        <div class="export-field-info">
                            <div class="export-field-number">${player.number || '?'}</div>
                            <div class="export-field-name">${escapeHTML(player.name)}</div>
                            ${showPosition}
                        </div>
                    </div>
                `;
            } else {
                defendersHTML += `<div class="export-field-slot empty">Пусто</div>`;
            }
        }

        linesHTML += `
            <div class="export-line">
                <div class="export-line-title">${lineNum} звено</div>
                <div class="export-forwards-group">
                    <div class="export-position-label">Нападающие</div>
                    <div class="export-forwards-container">${forwardsHTML}</div>
                </div>
                <div class="export-defenders-group">
                    <div class="export-position-label">Защитники</div>
                    <div class="export-defenders-container">${defendersHTML}</div>
                </div>
            </div>
        `;
    }

    // Генерация секции вратаря
    const goalie = game.lineup[0];
    let goalieHTML = '';
    if (goalie) {
        goalieHTML = `
            <div class="export-goalie-slot">
                <div class="export-goalie-info">
                    <div class="export-goalie-number">${goalie.number || '?'}</div>
                    <div class="export-goalie-name">${escapeHTML(goalie.name)}</div>
                    <div class="export-goalie-position">${getPositionShort(goalie.position)}</div>
                </div>
            </div>
        `;
    } else {
        goalieHTML = '<div class="export-goalie-slot empty">Вратарь не выбран</div>';
    }

    // Формируем строку с датой (дд.мм.гггг) и временем
    let dateTimeStr = 'Не указана';
    if (game.date) {
        const [y, m, d] = game.date.split('-');
        dateTimeStr = d && m && y ? `${d}.${m}.${y}` : game.date;
        if (game.time) {
            dateTimeStr += ` ${game.time}`;
        }
    }

    // Формируем строку с днем недели
    let weekdayStr = '';
    if (game.weekday) {
        weekdayStr = `<div class="export-game-weekday">${escapeHTML(game.weekday)}</div>`;
    }

    // Формируем строку с цветом формы
    let colorStr = '';
    if (game.color) {
        colorStr = `<div class="export-game-color">ФОРМА ${escapeHTML(game.color.toUpperCase())}</div>`;
    }

    return `
        <div class="export-left">
            <div class="export-title">${escapeHTML(game.title || 'Состав команды')}</div>
            <div class="export-game-info">
                <div class="export-game-date">Дата: ${escapeHTML(dateTimeStr)}</div>
                ${weekdayStr}
                ${game.stadium ? `<div class="export-game-stadium">Стадион: ${escapeHTML(game.stadium)}</div>` : ''}
                ${colorStr}
                ${game.score ? `<div class="export-game-score">Счет: ${escapeHTML(game.score)}</div>` : ''}
            </div>
            <div class="export-section-title">Список игроков</div>
            <div class="export-list">${listHTML}</div>
        </div>
        <div class="export-right">
            <div class="export-goalie-section">
                <div class="export-goalie-title">Вратарь</div>
                ${goalieHTML}
            </div>
            <div class="export-lines-container">
                ${linesHTML}
            </div>
        </div>
    `;
}

// Экспорт данных в JSON файл
function exportData() {
    const data = {
        team: team,
        games: games,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `hockey-lineup-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Данные успешно экспортированы! Файл сохранен в папку загрузок.');
}

// Импорт данных из JSON файла
function importData(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Проверяем структуру данных
            if (!data.team || !Array.isArray(data.team)) {
                throw new Error('Неверный формат файла: отсутствует массив команды');
            }

            if (!data.games || !Array.isArray(data.games)) {
                throw new Error('Неверный формат файла: отсутствует массив игр');
            }

            // Проверяем структуру каждого игрока
            const invalidPlayer = data.team.find(p =>
                !p || typeof p !== 'object' ||
                typeof p.name !== 'string' || p.name.trim() === '' ||
                !['number', 'string'].includes(typeof p.id) ||
                typeof p.position !== 'string'
            );
            if (invalidPlayer) {
                throw new Error('Файл содержит некорректные данные игрока. Проверьте формат файла.');
            }

            // Проверяем структуру каждой игры
            const invalidGame = data.games.find(g =>
                !g || typeof g !== 'object' ||
                !['number', 'string'].includes(typeof g.id) ||
                typeof g.title !== 'string' ||
                !Array.isArray(g.readyPlayers) ||
                !Array.isArray(g.lineup)
            );
            if (invalidGame) {
                throw new Error('Файл содержит некорректные данные игры. Проверьте формат файла.');
            }
            
            // Подтверждение импорта
            const confirmMessage = `Вы уверены, что хотите импортировать данные?\n\n` +
                `Команда: ${data.team.length} игроков\n` +
                `Игры: ${data.games.length} игр\n\n` +
                `⚠️ Все текущие данные будут заменены!`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // Импортируем данные
            team = data.team;
            games = data.games;
            
            // Сохраняем в localStorage
            saveData();
            
            // Обновляем интерфейс
            renderTeam();
            renderGamesList();
            
            // Сбрасываем текущую игру
            currentGameId = null;
            document.getElementById('gamesSection').style.display = 'block';
            document.getElementById('gameWorkSection').style.display = 'none';
            document.getElementById('saveAsJpegBtn').style.display = 'none';
            
            closeModal('importDataModal');
            
            // Очищаем input файла
            document.getElementById('importFileInput').value = '';
            
            alert('Данные успешно импортированы!');
            
        } catch (error) {
            console.error('Ошибка импорта:', error);
            alert('Ошибка при импорте данных: ' + error.message);
        }
    };
    
    reader.onerror = () => {
        alert('Ошибка при чтении файла');
    };
    
    reader.readAsText(file);
}

// Копирование списка команды в буфер обмена в формате кода
function copyTeamCode() {
    if (team.length === 0) {
        alert('Список команды пуст. Добавьте игроков перед копированием.');
        return;
    }
    
    // Формируем код в формате JavaScript массива
    const codeLines = team.map(player => {
        return `            { id: ${player.id}, name: '${player.name.replace(/'/g, "\\'")}', number: ${player.number || 0}, position: '${player.position}' }`;
    });
    
    const code = `        team = [\n${codeLines.join(',\n')}\n        ];`;
    
    copyToClipboard(code,
        `Код списка команды (${team.length} игроков) скопирован в буфер обмена!\n\n` +
        `Вы можете вставить его в функцию loadData() в файле app.js, заменив начальные данные.`
    );
}

// Копирование списка команды как текста, сгруппированного по статусам
function copyTeamText() {
    const game = getCurrentGame();
    if (!game) {
        alert('Сначала выберите игру, чтобы скопировать список команды со статусами.');
        return;
    }

    if (team.length === 0) {
        alert('Список команды пуст. Добавьте игроков перед копированием.');
        return;
    }

    if (!game.playerStatuses) {
        game.playerStatuses = {};
    }

    const groups = {
        readyGoalies: [],
        readyField: [],
        survey: [],
        doubtful: [],
        'not-ready': [],
        none: []
    };

    team.forEach(player => {
        const status = game.playerStatuses[player.id] || null;
        if (status === 'ready') {
            // В "ГОТОВЫ" вратаря не нумеруем и дописываем "Вр"
            if (getPositionShort(player.position) === 'Вр') {
                groups.readyGoalies.push(`${player.name} Вр`);
            } else {
                groups.readyField.push(player.name);
            }
        } else if (status === 'survey') {
            groups.survey.push(player.name);
        } else if (status === 'doubtful') {
            groups.doubtful.push(player.name);
        } else if (status === 'not-ready') {
            groups['not-ready'].push(player.name);
        } else {
            groups.none.push(player.name);
        }
    });

    const lines = [];

    if (groups.readyGoalies.length || groups.readyField.length) {
        lines.push('ГОТОВЫ:');
        // Вратари — без номера
        groups.readyGoalies.forEach((line) => {
            lines.push(line);
        });
        // Полевые — с нумерацией с 1
        groups.readyField.forEach((line, index) => {
            lines.push(`${index + 1}. ${line}`);
        });
        lines.push('');
    }

    if (groups.survey.length) {
        lines.push('ОПРОС:');
        groups.survey.forEach((line, index) => {
            lines.push(`${index + 1}. ${line}`);
        });
        lines.push('');
    }

    if (groups.doubtful.length) {
        lines.push('ПОД ?:');
        groups.doubtful.forEach((line, index) => {
            lines.push(`${index + 1}. ${line}`);
        });
        lines.push('');
    }

    if (groups['not-ready'].length) {
        lines.push('ПАС:');
        groups['not-ready'].forEach((line, index) => {
            lines.push(`${index + 1}. ${line}`);
        });
        lines.push('');
    }

    if (groups.none.length) {
        lines.push('БЕЗ СТАТУСА:');
        groups.none.forEach((line, index) => {
            lines.push(`${index + 1}. ${line}`);
        });
        lines.push('');
    }

    const text = lines.join('\n').trim();

    if (!text) {
        alert('Нет данных для копирования.');
        return;
    }

    copyToClipboard(text, 'Список команды со статусами скопирован в буфер обмена.');
}

// Инициализация PWA установки
function initPWAInstall() {
    // Проверяем, установлено ли уже приложение
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    // Показываем/скрываем кнопку установки в интерфейсе
    updatePWAInstallButton(!isInstalled);

    if (isInstalled) {
        return; // Уже установлено
    }

    // Проверяем, не был ли баннер уже отклонен
    const dismissed = localStorage.getItem('pwaInstallDismissed');
    if (dismissed) {
        const dismissTime = parseInt(dismissed);
        const daysSinceDismiss = (Date.now() - dismissTime) / (1000 * 60 * 60 * 24);
        // Показываем снова через 7 дней
        if (daysSinceDismiss < 7) {
            return;
        }
    }

    // Обработчик события beforeinstallprompt (для Android Chrome, Edge и др.)
    window.addEventListener('beforeinstallprompt', (e) => {
        // Предотвращаем автоматический показ баннера браузера
        e.preventDefault();
        deferredPrompt = e;
        // Обновляем кнопку в интерфейсе
        updatePWAInstallButton(true);
        // Показываем баннер только если не был отклонен недавно
        const dismissed = localStorage.getItem('pwaInstallDismissed');
        if (!dismissed) {
            showPWAInstallBanner(false);
        }
    });

    // Для iOS и других браузеров без beforeinstallprompt
    setTimeout(() => {
        if (deferredPrompt === null && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                showPWAInstallBanner(true);
            } else {
                // Для других браузеров тоже показываем инструкции
                showPWAInstallBanner(true);
            }
        }
    }, 3000);
}

// Обновление видимости кнопки установки PWA в интерфейсе
function updatePWAInstallButton(show) {
    const btn = document.getElementById('showPWAInstallBtn');
    if (btn) {
        btn.style.display = show ? 'inline-block' : 'none';
    }
}

// Ручной вызов баннера установки PWA
function showPWAInstallManually() {
    // Сбрасываем флаг отклонения
    localStorage.removeItem('pwaInstallDismissed');
    
    // Проверяем, есть ли deferredPrompt
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (deferredPrompt) {
        // Если есть deferredPrompt, показываем баннер с кнопкой установки
        showPWAInstallBanner(false);
    } else {
        // Иначе показываем инструкции
        showPWAInstallBanner(true);
    }
}

// Показать баннер установки PWA
function showPWAInstallBanner(isIOS = false) {
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;

    const installBtn = document.getElementById('pwaInstallBtn');
    
    if (isIOS || !deferredPrompt) {
        // Для iOS или если нет deferredPrompt показываем инструкции
        if (installBtn) {
            installBtn.textContent = 'Инструкция';
        }
    } else {
        // Для Android с deferredPrompt
        if (installBtn) {
            installBtn.textContent = 'Установить';
        }
    }

    banner.style.display = 'block';
}

// Обработка установки PWA
function handlePWAInstall() {
    // Проверяем, есть ли deferredPrompt
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Пользователь принял установку PWA');
                // Скрываем кнопку после установки
                updatePWAInstallButton(false);
            } else {
                console.log('Пользователь отклонил установку PWA');
            }
            deferredPrompt = null;
            dismissPWAInstallBanner();
        });
    } else {
        // Для браузеров без beforeinstallprompt (например, iOS Safari)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            alert('Для установки на iOS:\n\n' +
                  '1. Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх) внизу экрана\n' +
                  '2. Прокрутите вниз и выберите "На экран «Домой»"\n' +
                  '3. Нажмите "Добавить"');
        } else {
            alert('Для установки приложения:\n\n' +
                  'Chrome/Edge: Нажмите на меню (три точки) → "Установить приложение"\n' +
                  'Firefox: Меню → "Установить"\n' +
                  'Safari (macOS): Файл → "Добавить на экран «Домой»"');
        }
        dismissPWAInstallBanner();
    }
}

// Закрыть баннер установки PWA
function dismissPWAInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
        banner.style.display = 'none';
        // Сохраняем время отклонения
        localStorage.setItem('pwaInstallDismissed', Date.now().toString());
        // Кнопка в интерфейсе остается видимой для повторного вызова
    }
}

// Доступ из разметки (onclick в карточках игроков)
window.removeFromStatus = removeFromStatus;
