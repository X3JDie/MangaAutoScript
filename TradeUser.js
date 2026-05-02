// ==UserScript==
// @name         MangaBuff Orchestrator Pro
// @version      3.1
// @description  Приоритетные пользователи + проверка онлайн + быстрый трейд
// @author       X3JDIe
// @match        https://mangabuff.ru/alliances/*/boost*
// @match        https://mangabuff.ru/clubs/*/boost*
// @match        https://mangabuff.ru/cards/*/users*
// @match        https://mangabuff.ru/users/*
// @grant        window.close
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    console.log("[Loader] 📦 MangaBuff Orchestrator Pro v3.1 загружен");
    
    const CONFIG = {
        boostRefresh: 1500,
        nextUserDelay: 8500,
        lockKey: 'mb_orch_heartbeat',
        minOwners: 50,
        activeKey: 'mb_orch_is_active',
        priorityPoolKey: 'mb_priority_users',
        maxOnlineMinutes: 10,        // Макс. минут с последнего входа для считания "онлайн"
        priorityCheckDelay: 3000,    // Задержка между проверками приоритетных
        onlineCheckTimeout: 8000     // Таймаут запроса статуса онлайн
    };

    // === ПРИОРИТЕТНЫЙ ПУЛ (можно редактировать вручную или через кнопку) ===
    let priorityUsers = JSON.parse(localStorage.getItem(CONFIG.priorityPoolKey) || '[]');
    
    // Быстрое добавление через код (раскомментируйте и добавьте свои ID):
    // priorityUsers = [755130, 10370, 286311, 399972, 44063, 593926, 897332, 29038, 108391, 300416, 41400, 12289, 88533, 851135];
    // localStorage.setItem(CONFIG.priorityPoolKey, JSON.stringify(priorityUsers));

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    
    const getImgId = (src) => {
        if (!src) return 'NOT_FOUND';
        const parts = src.split('/');
        return parts[parts.length - 1];
    };

    const getUserIdFromUrl = (url) => {
        const match = url.match(/\/users\/(\d+)/);
        return match ? parseInt(match[1]) : null;
    };

    const parseOnlineStatus = (text) => {
        // Парсит: "В сети 3 минуты назад" → 3, "В сети" → 0, "Был 2 часа назад" → 120+
        if (!text) return Infinity;
        text = text.toLowerCase().trim();
        
        if (text.includes('в сети') && !text.includes('назад')) return 0;
        
        const minutesMatch = text.match(/(\d+)\s*минут/);
        if (minutesMatch) return parseInt(minutesMatch[1]);
        
        const hoursMatch = text.match(/(\d+)\s*час/);
        if (hoursMatch) return parseInt(hoursMatch[1]) * 60;
        
        const daysMatch = text.match(/(\d+)\s*дн/);
        if (daysMatch) return parseInt(daysMatch[1]) * 1440;
        
        return Infinity;
    };

    const isUserOnline = async (userId) => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.onlineCheckTimeout);
            
            const response = await fetch(`/users/${userId}`, { 
                signal: controller.signal,
                headers: { 'Accept': 'text/html' }
            });
            clearTimeout(timeout);
            
            if (!response.ok) return false;
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const statusEl = doc.querySelector('.profile__info span');
            if (!statusEl) return false;
            
            const minutesAgo = parseOnlineStatus(statusEl.textContent);
            const online = minutesAgo <= CONFIG.maxOnlineMinutes;
            
            console.log(`[Orchestrator] 👤 ${userId}: ${minutesAgo} мин назад → ${online ? '✅ В пуле' : '❌ Пропуск'}`);
            return online;
            
        } catch (e) {
            console.warn(`[Orchestrator] Ошибка проверки ${userId}:`, e.message);
            return false;
        }
    };

    const sendTradeToUser = async (userId) => {
        try {
            // Переход на страницу карты пользователя для инициации трейда
            window.location.href = `/cards/${userId}/users`;
            return true;
        } catch (e) {
            console.warn(`[Orchestrator] Ошибка трейда с ${userId}:`, e);
            return false;
        }
    };

    // === ИНТЕРФЕЙС: КНОПКА ВКЛ/ВЫКЛ ===
    const injectInterface = () => {
        const findCardBtn = document.querySelector('a[href*="/cards/"][href*="/users"].button--block');
        if (!findCardBtn || document.getElementById('mb-toggle-btn')) return;

        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'mb-toggle-btn';
        toggleBtn.className = 'button button--block';
        toggleBtn.style.marginTop = '10px';
        toggleBtn.style.transition = 'all 0.3s';
        toggleBtn.style.fontSize = '14px';

        if (isActive) {
            toggleBtn.innerText = '⏹ ОСТАНОВИТЬ СКРИПТ';
            toggleBtn.style.backgroundColor = '#ef4444';
            toggleBtn.style.borderColor = '#b91c1c';
        } else {
            toggleBtn.innerText = '▶ ЗАПУСТИТЬ СКРИПТ';
            toggleBtn.style.backgroundColor = '#10b981';
            toggleBtn.style.borderColor = '#047857';
        }

        toggleBtn.onclick = (e) => {
            e.preventDefault();
            const newState = !(localStorage.getItem(CONFIG.activeKey) === 'true');
            localStorage.setItem(CONFIG.activeKey, newState);
            
            if (GM_notification) {
                GM_notification({
                    title: 'MangaBuff Orchestrator',
                    text: newState ? '✅ Скрипт запущен' : '⏹ Скрипт остановлен',
                    timeout: 2000
                });
            }
            window.location.reload();
        };

        findCardBtn.parentNode.insertBefore(toggleBtn, findCardBtn.nextSibling);
    };

    // === ИНТЕРФЕЙС: КНОПКА "В ПУЛ" НА ПРОФИЛЕ ПОЛЬЗОВАТЕЛЯ ===
    const injectPoolButton = () => {
        const controls = document.querySelector('.profile__controls');
        const userId = getUserIdFromUrl(window.location.href);
        
        if (!controls || !userId || document.getElementById('mb-pool-btn')) return;
        
        // Не добавляем кнопку себе
        if (document.querySelector('.profile__header--own')) return;

        const isInPool = priorityUsers.includes(userId);
        const poolBtn = document.createElement('button');
        poolBtn.id = 'mb-pool-btn';
        poolBtn.className = 'friend-controls__add-friend';
        poolBtn.type = 'button';
        poolBtn.style.cssText = `
            background: ${isInPool ? '#10b981' : '#6366f1'};
            border-color: ${isInPool ? '#059669' : '#4f46e5'};
            margin-left: 8px;
            transition: all 0.2s;
        `;
        poolBtn.title = isInPool ? 'Убрать из приоритетного пула' : 'Добавить в приоритетный пул для обмена';
        poolBtn.innerHTML = `<i class="icon icon-star${isInPool ? '-filled' : ''}"></i>`;
        
        poolBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (priorityUsers.includes(userId)) {
                priorityUsers = priorityUsers.filter(id => id !== userId);
                poolBtn.style.background = '#6366f1';
                poolBtn.style.borderColor = '#4f46e5';
                poolBtn.title = 'Добавить в приоритетный пул для обмена';
                poolBtn.innerHTML = '<i class="icon icon-star"></i>';
                console.log(`[Orchestrator] 👤 ${userId} удалён из пула`);
            } else {
                priorityUsers.push(userId);
                poolBtn.style.background = '#10b981';
                poolBtn.style.borderColor = '#059669';
                poolBtn.title = 'Убрать из приоритетного пула';
                poolBtn.innerHTML = '<i class="icon icon-star-filled"></i>';
                console.log(`[Orchestrator] 👤 ${userId} добавлен в пул`);
                
                // Опционально: сразу проверить онлайн и предложить трейд
                if (confirm(`✅ ${userId} в пуле!\n\nПроверить онлайн-статус сейчас?`)) {
                    poolBtn.disabled = true;
                    poolBtn.innerText = '⏳';
                    const online = await isUserOnline(userId);
                    if (online) {
                        if (confirm(`🟢 Пользователь онлайн! Отправить трейд?`)) {
                            await sendTradeToUser(userId);
                        }
                    } else {
                        alert('🔴 Пользователь не в сети (или давно не был). Ждём...');
                    }
                    poolBtn.disabled = false;
                    poolBtn.innerHTML = '<i class="icon icon-star-filled"></i>';
                }
            }
            
            localStorage.setItem(CONFIG.priorityPoolKey, JSON.stringify(priorityUsers));
        };

        controls.appendChild(poolBtn);
    };

    // === ПЕРЕХВАТ ОШИБОК 422 ===
    let lastRequestFailed = false;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (args[0].includes('/trades/create') && response.status === 422) {
            lastRequestFailed = true;
            console.warn("[Orchestrator] Ошибка 422: Пропуск пользователя.");
        }
        return response;
    };

    async function fastRejectAll() {
        try { await originalFetch('/trades/rejectAll?type_trade=sender', { method: 'GET' }); } catch (e) {}
    }

    // === ПРОВЕРКА ПРИОРИТЕТНОГО ПУЛА ===
    async function processPriorityPool() {
        if (priorityUsers.length === 0) return false;
        
        console.log(`[Orchestrator] 🔍 Проверка приоритетного пула: ${priorityUsers.length} пользователей`);
        
        for (const userId of priorityUsers) {
            // Проверка флага остановки
            if (localStorage.getItem(CONFIG.activeKey) !== 'true') return false;
            
            const online = await isUserOnline(userId);
            if (online) {
                console.log(`[Orchestrator] 🎯 Нацеливаюсь на ${userId} (онлайн!)`);
                await sendTradeToUser(userId);
                return true; // Успешно начали трейд
            }
            
            // Задержка между проверками, чтобы не спамить
            await new Promise(r => setTimeout(r, CONFIG.priorityCheckDelay));
        }
        
        return false; // Никто не онлайн
    }

    // === ОСНОВНОЙ ЦИКЛ ===
    async function run() {
        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const url = new URL(window.location.href);

        // Инъекция интерфейса
        if (url.pathname.includes('/boost')) injectInterface();
        if (url.pathname.includes('/users/') && !url.pathname.includes('/users*')) injectPoolButton();
        
        if (!isActive) return;

        // === РЕЖИМ: BOOST-СТРАНИЦА ===
        if (url.pathname.includes('/boost')) {
            const cardImg = document.querySelector('img[src*="/img/cards/"]');
            const cardLink = document.querySelector('a[href*="/cards/"]');
            const currentCardId = getImgId(cardImg ? cardImg.src : null);
            const savedCardId = localStorage.getItem('mb_last_card_img_id');

            if (savedCardId && savedCardId !== currentCardId && currentCardId !== 'NOT_FOUND') {
                console.log("[Orchestrator] Карта изменилась. Сброс поиска.");
                localStorage.setItem('mb_kill_search', Date.now().toString());
                await fastRejectAll();
                localStorage.setItem('mb_last_card_img_id', currentCardId);
                setTimeout(() => window.location.reload(), 1000);
                return;
            }
            if (!savedCardId && currentCardId !== 'NOT_FOUND') localStorage.setItem('mb_last_card_img_id', currentCardId);

            const btn = document.querySelector('.club__boost-btn, .alliance__boost-btn') || 
                       [...document.querySelectorAll('button')].find(el => el.textContent.includes('Внести вклад'));
            
            if (btn && !btn.disabled) {
                console.log("[Orchestrator] Вклад доступен. Выполняю.");
                localStorage.setItem('mb_kill_search', Date.now().toString());
                await fastRejectAll();
                btn.click();
                setTimeout(() => window.location.reload(), 3000);
                return;
            }

            const lastHb = parseInt(localStorage.getItem(CONFIG.lockKey) || '0');
            if (cardLink && (Date.now() - lastHb) > 12000) {
                localStorage.setItem(CONFIG.lockKey, Date.now().toString());
                let targetUrl = cardLink.href;
                if (!targetUrl.includes('/users')) targetUrl = targetUrl.replace(/\/$/, '') + '/users';
                window.open(targetUrl, '_blank');
            }
            setTimeout(() => window.location.reload(), CONFIG.boostRefresh);
        }

        // === РЕЖИМ: СПИСОК ПОЛЬЗОВАТЕЛЕЙ КАРТЫ ===
        if (url.pathname.includes('/cards/') && url.pathname.includes('/users')) {
            
            // 🎯 СНАЧАЛА ПРОВЕРЯЕМ ПРИОРИТЕТНЫЙ ПУЛ
            const priorityDone = await processPriorityPool();
            if (priorityDone) return; // Ушли на трейд с приоритетным пользователем

            // Обычный цикл по списку
            setInterval(() => {
                if (Date.now() - parseInt(localStorage.getItem('mb_kill_search') || '0') < 5000) window.close();
                if (localStorage.getItem(CONFIG.activeKey) !== 'true') window.close();
            }, 800);

            localStorage.setItem(CONFIG.lockKey, Date.now().toString());
            setInterval(() => localStorage.setItem(CONFIG.lockKey, Date.now().toString()), 4000);

            const onlineLinks = [...document.querySelectorAll('a.card-show__owner--online')];
            const targetLink = onlineLinks.find(link => !link.hasAttribute('data-orch-done'));
            const currentPage = parseInt(url.searchParams.get('page') || '1');

            if (targetLink) {
                targetLink.setAttribute('data-orch-done', 'true');
                const btn = targetLink.nextElementSibling?.querySelector('button');
                console.log(`[Orchestrator] Обмен с ${targetLink.innerText.trim()} (Стр. ${currentPage})`);

                if (btn) {
                    lastRequestFailed = false;
                    btn.click();
                    let waited = 0;
                    const checkInterval = setInterval(() => {
                        waited += 200;
                        if (lastRequestFailed || waited >= CONFIG.nextUserDelay || localStorage.getItem(CONFIG.activeKey) !== 'true') {
                            clearInterval(checkInterval);
                            run();
                        }
                    }, 200);
                } else { run(); }
            } else {
                const nextPage = currentPage + 1;
                console.log(`[Orchestrator] Переход на страницу ${nextPage}`);
                url.searchParams.set('page', nextPage);
                window.location.replace(url.toString());
            }
        }
    }

    // === УПРАВЛЕНИЕ ПУЛОМ ЧЕРЕЗ КОНСОЛЬ (для продвинутых) ===
    window.MangaBuffPool = {
        add: (id) => {
            const num = parseInt(id);
            if (!priorityUsers.includes(num)) {
                priorityUsers.push(num);
                localStorage.setItem(CONFIG.priorityPoolKey, JSON.stringify(priorityUsers));
                console.log(`✅ Добавлен: ${num}`);
            }
        },
        remove: (id) => {
            const num = parseInt(id);
            priorityUsers = priorityUsers.filter(x => x !== num);
            localStorage.setItem(CONFIG.priorityPoolKey, JSON.stringify(priorityUsers));
            console.log(`❌ Удалён: ${num}`);
        },
        list: () => console.log('📋 Пул:', priorityUsers),
        clear: () => {
            priorityUsers = [];
            localStorage.setItem(CONFIG.priorityPoolKey, '[]');
            console.log('🗑 Пул очищен');
        },
        config: (key, val) => {
            if (CONFIG.hasOwnProperty(key)) {
                CONFIG[key] = val;
                console.log(`⚙️ ${key} = ${val}`);
            }
        }
    };
    console.log('🎮 MangaBuffPool готов: add(id), remove(id), list(), clear(), config(key,val)');

    // Запуск с небольшой задержкой для загрузки страницы
    setTimeout(run, 1500);
})();
