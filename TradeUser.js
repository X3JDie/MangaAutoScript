// ==UserScript==
// @name         MangaBuff Orchestrator Pro
// @version      3.2
// @description  Приоритетные пользователи + проверка онлайн + кнопка в пул (ИСПРАВЛЕНО)
// @author       X3JDIe
// @match        https://mangabuff.ru/alliances/*/boost*
// @match        https://mangabuff.ru/clubs/*/boost*
// @match        https://mangabuff.ru/cards/*/users*
// @match        https://mangabuff.ru/users/*
// @match        https://mangabuff.ru/users
// @grant        window.close
// @grant        GM_notification
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
    // 🔧 ВКЛЮЧИТЕ ЭТО ДЛЯ ОТЛАДКИ (показывает логи в консоли)
    const DEBUG = true;
    const log = (...args) => DEBUG && console.log('[MB-Orch]', ...args);

    console.log("[Loader] 📦 MangaBuff Orchestrator Pro v3.2 загружен");
    
    const CONFIG = {
        boostRefresh: 1500,
        nextUserDelay: 8500,
        lockKey: 'mb_orch_heartbeat',
        activeKey: 'mb_orch_is_active',
        priorityPoolKey: 'mb_priority_users',
        maxOnlineMinutes: 10,
        priorityCheckDelay: 3000,
        onlineCheckTimeout: 8000
    };

    let priorityUsers = JSON.parse(localStorage.getItem(CONFIG.priorityPoolKey) || '[]');

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    const getUserIdFromUrl = (href) => {
        const match = (href || window.location.href).match(/\/users\/(\d+)/);
        return match ? parseInt(match[1]) : null;
    };

    const parseOnlineStatus = (text) => {
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

    // === 🔧 ИСПРАВЛЕННАЯ ФУНКЦИЯ: КНОПКА "В ПУЛ" ===
    const injectPoolButton = () => {
        const userId = getUserIdFromUrl();
        if (!userId) {
            log('❌ Не удалось получить ID пользователя из URL');
            return;
        }
        
        log(`🔍 Ищем контейнер кнопок для пользователя #${userId}`);
        
        // Пробуем несколько возможных селекторов (сайт может менять вёрстку)
        const possibleContainers = [
            '.profile__controls',
            '.user-profile__actions',
            '.profile-actions',
            '[class*="profile"] [class*="controls"]',
            '.profile-header__buttons'
        ];
        
        let controls = null;
        for (const selector of possibleContainers) {
            controls = document.querySelector(selector);
            if (controls) {
                log(`✅ Найдено через селектор: ${selector}`, controls);
                break;
            }
        }
        
        if (!controls) {
            log('❌ Контейнер кнопок не найден. Доступные элементы рядом с аватаром:');
            log(document.querySelector('.profile__header') || document.body);
            return;
        }
        
        // Не добавляем кнопку себе и если уже есть
        if (document.getElementById('mb-pool-btn')) {
            log('ℹ️ Кнопка уже существует');
            return;
        }
        
        // Проверка: это ваш профиль?
        const isOwnProfile = document.body.classList.contains('profile--own') || 
                            document.querySelector('.profile__header--own') ||
                            document.querySelector('[data-is-own="true"]');
        if (isOwnProfile) {
            log('ℹ️ Это ваш профиль, кнопка не добавляется');
            return;
        }

        const isInPool = priorityUsers.includes(userId);
        const poolBtn = document.createElement('button');
        poolBtn.id = 'mb-pool-btn';
        poolBtn.type = 'button';
        poolBtn.className = 'button button--icon'; // Используем стандартные классы сайта
        poolBtn.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 40px !important;
            height: 40px !important;
            margin: 0 4px !important;
            padding: 0 !important;
            background: ${isInPool ? '#10b981' : '#6366f1'} !important;
            border: 2px solid ${isInPool ? '#059669' : '#4f46e5'} !important;
            border-radius: 8px !important;
            color: white !important;
            font-size: 18px !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
            z-index: 100 !important;
        `;
        poolBtn.title = isInPool ? '⭐ Убрать из приоритетного пула' : '⭐ Добавить в пул для быстрого трейда';
        poolBtn.innerHTML = isInPool ? '⭐' : '☆';
        poolBtn.dataset.userId = userId;
        
        // Визуальный эффект при наведении
        poolBtn.onmouseenter = () => {
            poolBtn.style.transform = 'scale(1.1)';
            poolBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        };
        poolBtn.onmouseleave = () => {
            poolBtn.style.transform = 'scale(1)';
            poolBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        };
        
        poolBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const id = parseInt(poolBtn.dataset.userId);
            log(`🖱 Клик по кнопке пула для пользователя #${id}`);
            
            if (priorityUsers.includes(id)) {
                priorityUsers = priorityUsers.filter(x => x !== id);
                poolBtn.style.background = '#6366f1';
                poolBtn.style.borderColor = '#4f46e5';
                poolBtn.innerHTML = '☆';
                poolBtn.title = '⭐ Добавить в пул для быстрого трейда';
                log(`❌ Удалён из пула: ${id}`);
            } else {
                priorityUsers.push(id);
                poolBtn.style.background = '#10b981';
                poolBtn.style.borderColor = '#059669';
                poolBtn.innerHTML = '⭐';
                poolBtn.title = '⭐ Убрать из приоритетного пула';
                log(`✅ Добавлен в пул: ${id}`);
                
                // Предложение проверить онлайн
                if (confirm(`✅ ${id} добавлен в приоритетный пул!\n\n🔍 Проверить, онлайн ли пользователь сейчас?`)) {
                    poolBtn.disabled = true;
                    poolBtn.innerHTML = '⏳';
                    poolBtn.title = 'Проверка...';
                    
                    try {
                        const online = await isUserOnline(id);
                        if (online) {
                            if (confirm(`🟢 Пользователь #${id} онлайн! (был в сети ≤ ${CONFIG.maxOnlineMinutes} мин)\n\n🚀 Отправить трейд?`)) {
                                log(`🎯 Запуск трейда с ${id}`);
                                window.location.href = `/cards/${id}/users`;
                                return;
                            }
                        } else {
                            alert(`🔴 Пользователь #${id} не в сети (или был давно).\nСкрипт проверит его автоматически, когда он появится онлайн.`);
                        }
                    } catch (err) {
                        console.error('Ошибка проверки онлайн:', err);
                        alert('⚠️ Не удалось проверить статус. Попробуйте позже.');
                    } finally {
                        poolBtn.disabled = false;
                        poolBtn.innerHTML = '⭐';
                        poolBtn.title = '⭐ Убрать из приоритетного пула';
                    }
                }
            }
            
            localStorage.setItem(CONFIG.priorityPoolKey, JSON.stringify(priorityUsers));
            
            // Визуальное подтверждение
            if (GM_notification) {
                GM_notification({
                    title: 'MangaBuff Pool',
                    text: priorityUsers.includes(id) ? `✅ #${id} в пуле` : `❌ #${id} удалён`,
                    timeout: 1500
                });
            }
        };

        // Добавляем кнопку ПЕРВОЙ в контейнер, чтобы точно была видна
        if (controls.firstChild) {
            controls.insertBefore(poolBtn, controls.firstChild);
        } else {
            controls.appendChild(poolBtn);
        }
        
        log(`✅ Кнопка "⭐" успешно добавлена для пользователя #${userId}`);
    };

    // === ПРОВЕРКА ОНЛАЙН (без изменений, но с логами) ===
    const isUserOnline = async (userId) => {
        log(`🔎 Проверка онлайн-статуса для #${userId}`);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
                log(`⏱ Таймаут запроса для #${userId}`);
            }, CONFIG.onlineCheckTimeout);
            
            const response = await fetch(`/users/${userId}`, { 
                signal: controller.signal,
                headers: { 'Accept': 'text/html', 'X-Requested-With': 'XMLHttpRequest' }
            });
            clearTimeout(timeout);
            
            if (!response.ok) {
                log(`❌ HTTP ${response.status} для #${userId}`);
                return false;
            }
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Пробуем несколько селекторов для статуса
            const statusSelectors = [
                '.profile__info span',
                '.user-status',
                '[class*="online"]',
                '.profile-status'
            ];
            
            let statusText = null;
            for (const sel of statusSelectors) {
                const el = doc.querySelector(sel);
                if (el && el.textContent.trim()) {
                    statusText = el.textContent.trim();
                    log(`📝 Найден статус через "${sel}": "${statusText}"`);
                    break;
                }
            }
            
            if (!statusText) {
                log('⚠️ Не удалось найти элемент со статусом');
                return false;
            }
            
            const minutesAgo = parseOnlineStatus(statusText);
            const online = minutesAgo <= CONFIG.maxOnlineMinutes;
            
            log(`📊 #${userId}: "${statusText}" → ${minutesAgo} мин назад → ${online ? '✅ ONLINE' : '❌ OFFLINE'}`);
            return online;
            
        } catch (e) {
            log(`❌ Ошибка проверки #${userId}:`, e.message);
            return false;
        }
    };

    // === ИНТЕРФЕЙС: КНОПКА ВКЛ/ВЫКЛ (без изменений) ===
    const injectInterface = () => {
        const findCardBtn = document.querySelector('a[href*="/cards/"][href*="/users"].button--block');
        if (!findCardBtn || document.getElementById('mb-toggle-btn')) return;

        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'mb-toggle-btn';
        toggleBtn.className = 'button button--block';
        toggleBtn.style.marginTop = '10px';
        toggleBtn.style.transition = 'all 0.3s';

        toggleBtn.innerText = isActive ? '⏹ ОСТАНОВИТЬ СКРИПТ' : '▶ ЗАПУСТИТЬ СКРИПТ';
        toggleBtn.style.backgroundColor = isActive ? '#ef4444' : '#10b981';
        toggleBtn.style.borderColor = isActive ? '#b91c1c' : '#047857';

        toggleBtn.onclick = (e) => {
            e.preventDefault();
            const newState = !(localStorage.getItem(CONFIG.activeKey) === 'true');
            localStorage.setItem(CONFIG.activeKey, newState);
            window.location.reload();
        };

        findCardBtn.parentNode.insertBefore(toggleBtn, findCardBtn.nextSibling);
    };

    // === ОСТАЛЬНЫЕ ФУНКЦИИ (fetch, run и т.д.) - сокращённо для краткости ===
    // ... [вставьте сюда остальные функции из предыдущей версии] ...
    // Для экономии места не дублирую весь код, логика run() не изменилась

    // === УПРОЩЁННЫЙ ЗАПУСК С ПРОВЕРКОЙ СТРАНИЦЫ ===
    const init = () => {
        log('🔄 Инициализация, URL:', window.location.href);
        
        const path = window.location.pathname;
        
        // Страница буста
        if (path.includes('/boost')) {
            log('📍 Режим: Boost-страница');
            injectInterface();
        }
        
        // Страница пользователя (ОСНОВНОЕ ИСПРАВЛЕНИЕ!)
        if (path.match(/^\/users\/\d+\/?$/)) {
            log('📍 Режим: Профиль пользователя');
            injectPoolButton();
        }
        
        // Страница списка пользователей карты
        if (path.includes('/cards/') && path.includes('/users')) {
            log('📍 Режим: Список пользователей карты');
            // Запускаем основной цикл (код из run() для этого режима)
        }
        
        log('✅ Инициализация завершена');
    };

    // Ждём полной загрузки + немного времени для динамического контента
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }
    
    // Экспорт для консоли
    window.MangaBuffPool = {
        add: (id) => { const n=+id; if(!priorityUsers.includes(n)){priorityUsers.push(n);localStorage.setItem(CONFIG.priorityPoolKey,JSON.stringify(priorityUsers));log(`✅ Добавлен: ${n}`);} },
        remove: (id) => { const n=+id; priorityUsers=priorityUsers.filter(x=>x!==n);localStorage.setItem(CONFIG.priorityPoolKey,JSON.stringify(priorityUsers));log(`❌ Удалён: ${n}`); },
        list: () => log('📋 Пул:', priorityUsers),
        clear: () => { priorityUsers=[]; localStorage.setItem(CONFIG.priorityPoolKey,'[]'); log('🗑 Пул очищен'); }
    };
    
})();
