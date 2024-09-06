// ==UserScript==
// @name         Shikimori Comments User ID
// @namespace    http://tampermonkey.net/
// @version      1.32
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

    function setCommentStats(commentId, userData) {
        const comment = document.querySelector(`.b-comment[id="${commentId}"]`);
        if (comment) {
            const formattedScore = userData.score === 0 ? '' : `: ${userData.score}`;
            let displayText = userData.status === 'N/A' ? '(—)' : `(${userData.status}${formattedScore})`;

            // Определение цвета в зависимости от статуса
            let color = '#888'; // Цвет по умолчанию (серый)
            switch (userData.status) {
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

            const scoreButton = comment.querySelector('.user-score-btn');
            if (scoreButton) {
                scoreButton.textContent = displayText;
                scoreButton.style.color = color;
                scoreButton.disabled = false;
            }
        }
    }

    // Функция для обработки данных пользователя
    async function getUserStats(userId) {
        const userData = userMap.get(userId);

        if (userData && userData.statsLoaded) {
            console.log(`Using cached data for user ID ${userId}`);
            
            return userData;
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

                    if(entry) userData.status = entry.status;
                    if(entry) userData.score = entry.score;
                    userData.statsLoaded = true;
                    userMap.set(userId, userData);

                    return userData;
                } 
                else if (response.status === 429) {
                    console.warn(`Rate limit exceeded for user ID ${userId}. Retrying...`);
                    attempt++;
                    await delay(1000 * attempt); // Увеличение задержки с каждой попыткой
                } 
                else {
                    return userData;
                }
            } catch (error) {
                console.error(error);
            }
        }

        console.error(`Failed to fetch data for user ID ${userId} after multiple attempts.`);
        return userData;
    }

    // Функция для обновления всех комментариев пользователя
    async function updateAllUserComments(userId) {
        const userData = await getUserStats(userId);
        userData.showStats = true;
        userMap.set(userId, userData);
        userData.showStats = true; // Устанавливаем флаг отображения статистики

        // Обновляем все комментарии пользователя
        userData.comments.forEach(commentId => {
            setCommentStats(commentId, userData);
        });
    }

    // Функция для сброса кнопки в исходное состояние
    function resetButton(commentId) {
        const comment = document.querySelector(`.b-comment[id="${commentId}"]`);
        if (comment) {
            const scoreButton = comment.querySelector('.user-score-btn');
            if (scoreButton) {
                scoreButton.textContent = 'Load'; // Возвращаем исходную надпись
                scoreButton.disabled = false; // Разблокируем кнопку
                scoreButton.style.color = 'black'
            }
        } 
    }

    // Функция для добавления кнопки к каждому комментарию
    function addButtonToComment(comment, userId) {
        const userNameElement = comment.querySelector('.name-date .name');
    
        if (userNameElement) {
            const existingButton = userNameElement.parentNode.querySelector('.user-score-btn');
    
            // Проверяем, есть ли кнопка
            if (!existingButton) {
                const commentId = comment.id;
                const scoreButton = document.createElement('button');
                scoreButton.textContent = 'Load';
                scoreButton.style.marginLeft = '5px';
                scoreButton.className = 'user-score-btn';
                scoreButton.id = `score-btn-${commentId}`;
    
                // Добавляем обработчик
                attachButtonListener(scoreButton, userId);
    
                userNameElement.parentNode.insertBefore(scoreButton, userNameElement.nextSibling);
    
                const userData = userMap.get(userId);
                if (userData.showStats) {
                    setCommentStats(commentId, userData);
                }
            } else {
                // Если кнопка существует, проверяем, есть ли у неё обработчик события
                //if (!existingButton.dataset.listenerAttached) {
                    // Добавляем обработчик, если его нет
                    attachButtonListener(existingButton, userId);
                //}
            }
        }
    }
    
    function attachButtonListener(button, userId) {
        button.addEventListener('click', async function () {
            const userData = userMap.get(userId);
            if (userData.showStats) {
                userData.comments.forEach(commentId => {
                    resetButton(commentId);
                });
                userData.showStats = false;
                userMap.set(userId, userData);
            } else {
                button.textContent = 'Loading...';
                button.disabled = true;
                await updateAllUserComments(userId);
            }
        });
    
        // Отмечаем, что обработчик был добавлен
        button.dataset.listenerAttached = 'true';
    }
    
    

    // Функция для добавления комментария пользователя в userMap
    function addCommentToMap(userId, comment) {
        if (!userMap.has(userId)) {
            userMap.set(userId, { status: 'N/A', score: 'N/A', showStats: false, comments: [], statsLoaded: false });
        }
        const userData = userMap.get(userId);
        userData.comments.push(comment.id);
    }

    // Функция для инициализации массива комментариев
    function initComments(comments) {
        console.log(`Processing ${comments.length} comments...`);

        for (const comment of comments) {
            const userId = comment.getAttribute('data-user_id');
            if (userId) {
                addCommentToMap(userId, comment);
                addButtonToComment(comment, userId);
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
                        if (node.classList.contains('comments-loaded')) {
                            const newComments = node.querySelectorAll('.b-comment');
                            initComments(newComments);
                        } else if (node.classList.contains('b-comment')) {
                            initComments([node]);
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

        if (!url.includes('https://shikimori.one/animes/')) {
            console.log('URL does not match expected patterns. Stopping script.');
            return;
        }

        animeId = getAnimeIdFromUrl();
        console.log(`Anime ID from URL: ${animeId}`);

        const initialComments = document.querySelectorAll('.b-comment');
        setTimeout(function () {
            initComments(initialComments);
        }, 1000);

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
