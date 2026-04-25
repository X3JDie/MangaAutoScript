// ==UserScript==
// @name         MangaBuff Вклады
// @version      1.2
// @author       X3JDie
// @match        https://mangabuff.ru/alliances/*/boost*
// @match        https://mangabuff.ru/clubs/*/boost*
// @match        https://mangabuff.ru/cards/*/users*
// @grant        window.close
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    console.log("[Loader] 📦Скрипт вклады загружен из GitHub  v1.2" );
    
    const CONFIG = {
        boostRefresh: 1500,
        nextUserDelay: 8500,
        lockKey: 'mb_orch_heartbeat',
        minOwners: 50,
        activeKey: 'mb_orch_is_active'
    };

    const injectInterface = () => {
        const findCardBtn = document.querySelector('a[href*="/cards/"][href*="/users"].button--block');
        if (!findCardBtn || document.getElementById('mb-toggle-btn')) return;

        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'mb-toggle-btn';
        toggleBtn.className = 'button button--block';
        toggleBtn.style.marginTop = '10px';
        toggleBtn.style.transition = 'all 0.3s';

        if (isActive) {
            toggleBtn.innerText = 'ОСТАНОВИТЬ СКРИПТ';
            toggleBtn.style.backgroundColor = '#ef4444';
            toggleBtn.style.borderColor = '#b91c1c';
        } else {
            toggleBtn.innerText = 'ЗАПУСТИТЬ СКРИПТ';
            toggleBtn.style.backgroundColor = '#10b981';
            toggleBtn.style.borderColor = '#047857';
        }

        toggleBtn.onclick = (e) => {
            e.preventDefault();
            const newState = !(localStorage.getItem(CONFIG.activeKey) === 'true');
            localStorage.setItem(CONFIG.activeKey, newState);
            window.location.reload();
        };

        findCardBtn.parentNode.insertBefore(toggleBtn, findCardBtn.nextSibling);
    };

    const getImgId = (src) => {
        if (!src) return 'NOT_FOUND';
        const parts = src.split('/');
        return parts[parts.length - 1];
    };

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

    async function run() {
        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const url = new URL(window.location.href);

        if (url.pathname.includes('/boost')) injectInterface();
        if (!isActive) return;

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

            const btn = document.querySelector('.club__boost-btn, .alliance__boost-btn') || [...document.querySelectorAll('button')].find(el => el.textContent.includes('Внести вклад'));
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
                //window.open(targetUrl, '_blank');
                GM_openInTab(targetUrl, { active: false, insert: true, setParent: true });

            }
            setTimeout(() => window.location.reload(), CONFIG.boostRefresh);
        }

        if (url.pathname.includes('/cards/') && url.pathname.includes('/users')) {
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

    setTimeout(run, 1500);
})();
