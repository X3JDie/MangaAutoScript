// ==UserScript==
// @name         MangaBuff
// @version      1
// @description Кнопка запуска в панели
// @author       @X3JDie
// @match        https://mangabuff.ru/alliances/*/boost*
// @match        https://mangabuff.ru/clubs/*/boost*
// @match        https://mangabuff.ru/cards/*/users*
// @grant        window.close
// @require
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        boostRefresh: 3000,
        nextUserDelay: 10500,
        lockKey: 'mb_orch_heartbeat',
        minOwners: 50,
        dryRun: false,
        activeKey: 'mb_orch_is_active' 
    };

    const log = (msg, color = '#e0b21e', cardData = {}) => {
        let panel = document.getElementById('mb-status-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'mb-status-panel';
            panel.style = 'position:fixed; top:10px; right:10px; z-index:10000; padding:15px; background:rgba(0,0,0,0.95); color:white; border-radius:8px; border-left:4px solid ' + color + '; font-family:monospace; font-size:12px; min-width:320px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events:auto;';
            document.body.appendChild(panel);
        }

        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';

        let cardHTML = cardData.current ? `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #444; font-size:10px;"><div style="color:#aaa;">ID КАРТИНКИ: <span style="color:#fff;">${cardData.current}</span></div><div style="color:#aaa; margin-top:5px;">СТРАНИЦА: <span style="color:#3b82f6;">${cardData.page || '1'}</span></div></div>` : '';

        panel.style.borderLeftColor = isActive ? '#10b981' : '#ef4444';

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="color:#3b82f6; font-size:10px; font-weight:bold;">TURBO v13.9</span>
                <button id="mb-toggle-btn" style="cursor:pointer; padding:4px 8px; border:none; border-radius:4px; background:${isActive ? '#ef4444' : '#10b981'}; color:white; font-weight:bold; font-size:10px;">
                    ${isActive ? 'STOP' : 'START'}
                </button>
            </div>
            <div style="font-size:13px; font-weight:bold;">${isActive ? msg : 'СКРИПТ НА ПАУЗЕ'}</div>
            ${isActive ? cardHTML : '<div style="color:#888; font-size:11px; margin-top:5px;">Нажмите START для начала</div>'}
        `;

        document.getElementById('mb-toggle-btn').onclick = () => {
            const newState = !(localStorage.getItem(CONFIG.activeKey) === 'true');
            localStorage.setItem(CONFIG.activeKey, newState);
            window.location.reload();
        };
    };

    const getImgId = (src) => {
        if (!src || src === 'NOT_FOUND') return 'NOT_FOUND';
        const parts = src.split('/');
        return parts[parts.length - 1];
    };

    let lastRequestFailed = false;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (args[0].includes('/trades/create') && response.status === 422) {
            lastRequestFailed = true;
        }
        return response;
    };

    async function fastRejectAll() {
        try { await originalFetch('/trades/rejectAll?type_trade=sender', { method: 'GET' }); } catch (e) {}
    }

    async function run() {
        const isActive = localStorage.getItem(CONFIG.activeKey) === 'true';
        const url = new URL(window.location.href);

        if (!isActive) {
            log("ПАУЗА", "#666");
            return;
        }

        
        if (url.pathname.includes('/boost')) {
            const cardImg = document.querySelector('img[src*="/img/cards/"]');
            const cardLink = document.querySelector('a[href*="/cards/"]');
            const currentCardId = getImgId(cardImg ? cardImg.src : 'NOT_FOUND');
            const savedCardId = localStorage.getItem('mb_last_card_img_id');

            if (savedCardId && savedCardId !== currentCardId && currentCardId !== 'NOT_FOUND') {
                log("СМЕНА КАРТЫ!", "#ef4444");
                localStorage.setItem('mb_kill_search', Date.now().toString());
                await fastRejectAll();
                localStorage.setItem('mb_last_card_img_id', currentCardId);
                setTimeout(() => window.location.reload(), 1000);
                return;
            }
            if (!savedCardId && currentCardId !== 'NOT_FOUND') localStorage.setItem('mb_last_card_img_id', currentCardId);

            const btn = document.querySelector('.club__boost-btn, .alliance__boost-btn') || [...document.querySelectorAll('button')].find(el => el.textContent.includes('Внести вклад'));
            if (btn && !btn.disabled) {
                log("ВНОШУ ВКЛАД...", "#10b981");
                localStorage.setItem('mb_kill_search', Date.now().toString());
                await fastRejectAll();
                btn.click();
                setTimeout(() => window.location.reload(), 3000);
                return;
            }

            log("МОНИТОРИНГ БУСТА", "#e0b21e", { current: currentCardId });
            const lastHb = parseInt(localStorage.getItem(CONFIG.lockKey) || '0');
            if (cardLink && (Date.now() - lastHb) > 12000) {
                localStorage.setItem(CONFIG.lockKey, Date.now().toString());
                let targetUrl = cardLink.href;
                if (!targetUrl.includes('/users')) targetUrl = targetUrl.replace(/\/$/, '') + '/users';
                window.open(targetUrl, '_blank');
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
                log(`ОБМЕН: ${targetLink.innerText.trim()}`, "#3b82f6", { current: getImgId(document.querySelector('img[src*="/img/cards/"]')?.src), page: currentPage });

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
                } else {
                    run();
                }
            } else {
                const nextPage = currentPage + 1;
                log(`СЛЕД. СТРАНИЦА: ${nextPage}`, "#8b5cf6");
                url.searchParams.set('page', nextPage);
                window.location.replace(url.toString());
            }
        }
    }

    setTimeout(run, 1500);
})();
