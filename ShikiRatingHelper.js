// ==UserScript==
// @name         Shikimori Comments User ID
// @namespace    http://tampermonkey.net/
// @version      1.27
// @description  Add user ID next to comment author's name on Shikimori.one
// @author       YourName
// @match        http://shikimori.one/*
// @match        https://shikimori.one/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const userMap = new Map();
    let animeId = null;

    // Функция для извлечения ID аниме из URL
    function getAnimeIdFromUrl() {
        const url = window.location.href;

        const match = url.match(/animes\/[a-zA-Z]?(\d+)/);
        const animePageId = match ? match[1] : null;
        if (animePageId) return animePageId;

        const forumMatch = url.match(/(?:animes|anime(?:-[a-z]+)?)-?(\d+)/);
        const animeForumId = forumMatch ? forumMatch[1] : null;
        if (animeForumId) return animeForumId;

        return null;
    }

    // Функция для задержки между запросами
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Функция для обработки данных пользователя
    async function processUserId(userId) {
        if (userMap.has(userId)) {
            console.log(`Using cached data for user ID ${userId}`);
            return userMap.get(userId);
        }

        const url = `https://shikimori.one/api/v2/user_rates?user_id=${userId}&target_id=${animeId}&target_type=Anime`;
        let attempt = 0;
        const maxAttempts = 5;

        while (attempt < maxAttempts) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                console.log(`Response code for user ID ${userId}: ${response.status}`);

                if (response.ok) {
                    const entry = data[0];
                    const result = entry
                        ? { status: entry.status, score: entry.score }
                        : { status: 'N/A', score: 'N/A' };
                    userMap.set(userId, result);
                    return result;
                } else if (response.status === 429) {
                    console.warn(`Rate limit exceeded for user ID ${userId}. Retrying...`);
                    attempt++;
                    await delay(1000 * attempt); // Увеличение задержки с каждой попыткой
                } else {
                    const result = { status: 'N/A', score: 'N/A' };
                    userMap.set(userId, result);
                    return result;
                }
            } catch (error) {
            }
        }

        console.error(`Failed to fetch data for user ID ${userId} after multiple attempts.`);
        return { status: 'N/A', score: 'N/A' };
    }

    // Функция для добавления ID пользователя к комментариям
    async function addUserIdToComments(comments) {
    console.log(`Processing ${comments.length} comments...`);

    for (const comment of comments) {
        const userId = comment.getAttribute('data-user_id');
        const userNameElement = comment.querySelector('.name-date .name');

        // Проверяем, существует ли уже подпись для этого комментария
        if (userId && userNameElement && !userNameElement.parentNode.querySelector('.user-score')) {
            // Создание кнопки для получения данных
            const loadButton = document.createElement('button');
            loadButton.className = 'user-score-button';
            loadButton.style.marginLeft = '5px';
            loadButton.textContent = 'Load';
            loadButton.style.fontSize = 'small'; // Размер кнопки маленький
            loadButton.style.padding = '2px 5px'; // Внутренние отступы

            // Добавление кнопки после имени пользователя
            userNameElement.parentNode.insertBefore(loadButton, userNameElement.nextSibling);

            // Обработчик клика по кнопке
            loadButton.addEventListener('click', async function () {
                // Отключаем кнопку, чтобы предотвратить повторные нажатия
                loadButton.disabled = true;
                loadButton.textContent = 'Loading...';

                // Получение данных о статусе и оценке
                const { status, score } = await processUserId(userId);

                // Форматирование строки текста
                let displayText = '';
                let color = '#888'; // Цвет по умолчанию (серый)

                if (status === 'N/A') {
                    displayText = '(-)';
                } else {
                    const formattedScore = score === 0 ? '' : `: ${score}`;
                    displayText = `(${status}${formattedScore})`;

                    // Определение цвета в зависимости от статуса
                    switch (status) {
                        case 'planned':
                            color = '#FFA500'; // желтый
                            break;
                        case 'watching':
                            color = '#00BFFF'; // голубой
                            break;
                        case 'completed':
                        case 'rewatching':
                            color = '#32CD32'; // зеленый
                            break;
                        case 'dropped':
                        case 'on_hold':
                            color = '#FF4500'; // красный
                            break;
                        default:
                            color = '#888'; // серый для неизвестных статусов
                    }
                }

                // Замена кнопки на текст с информацией
                const idSpan = document.createElement('span');
                idSpan.className = 'user-score';
                idSpan.textContent = displayText;
                idSpan.style.marginLeft = '5px';
                idSpan.style.color = color;

                loadButton.replaceWith(idSpan); // Замена кнопки на текст
            });
        }
    }
}

    // Функция для отслеживания добавления новых комментариев
    function observeCommentsLoaded() {
    const commentsContainer = document.querySelector('.b-comments');

    if (!commentsContainer) {
        console.error('Comments container not found.');
        return;
    }

    console.log('Setting up MutationObserver on comments container...');

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Проверка на добавление контейнера с классом comments-loaded
                    if (node.classList.contains('comments-loaded')) {
                        console.log('New comments-loaded container added:', node);
                        const newComments = node.querySelectorAll('.b-comment');
                        addUserIdToComments(newComments);
                    }
                    // Проверка на добавление комментария напрямую в b-comments
                    else if (node.classList.contains('b-comment')) {
                        console.log('New comment added directly to b-comments:', node);
                        addUserIdToComments([node]);
                    }
                }
            });
        });
    });

    observer.observe(commentsContainer, { childList: true, subtree: true });

    console.log('MutationObserver is now watching for new comments and comments-loaded containers.');
}


    // Инициализация скрипта
    function init() {
        console.log('Initializing script...');
        const url = window.location.href;

        const isOnForumPage = url.includes('https://shikimori.one/forum/animanga/anime');

        if (!isOnForumPage && !url.includes('https://shikimori.one/animes/')) {
            console.log('URL does not match expected patterns. Stopping script.');
            return;
        }

        animeId = getAnimeIdFromUrl();
        console.log(`Anime ID from URL: ${animeId}`);

        // Обработка существующих комментариев
        const initialComments = document.querySelectorAll('.b-comment');
        //addUserIdToComments(initialComments);
        const loadDelay = isOnForumPage ? 0 : 1000;

        setTimeout(function() {
            addUserIdToComments(initialComments);
        }, loadDelay);

        // Запуск наблюдения за добавлением новых контейнеров с комментариями
        observeCommentsLoaded();
    }

    function ready(fn) {
        document.addEventListener('page:load', fn);
        document.addEventListener('turbolinks:load', fn);

        if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    ready(init);

})();
