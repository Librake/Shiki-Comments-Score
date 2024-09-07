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

    const baseUrl = 'https://shikimori.one';
    const userMap = new Map();
    let titleId = null;
    let titleType = null;
    let entityType = null;

    // Функция для извлечения ID аниме из URL
    function getTitleIdFromUrl(titleType) {
        const url = window.location.href;
    
        // Определяем сегменты URL в зависимости от типа
        const segments = {
            'Anime': { type: 'animes', forum: 'anime' },
            'Manga': { type: 'mangas', forum: 'manga' },
            'Ranobe': { type: 'ranobe', forum: 'ranobe' }
        }[titleType];
    
        if (!segments) {
            console.log('Invalid titleType provided.');
            return null;
        }
    
        // Проверяем соответствие для страниц и форумов
        const pageMatch = url.match(new RegExp(`${segments.type}/[a-zA-Z]*(\\d+)`));
        if (pageMatch) return pageMatch[1];
    
        const forumMatch = url.match(new RegExp(`${segments.forum}-[a-zA-Z]*(\\d+)`));
        return forumMatch ? forumMatch[1] : null;
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

        const url = `${baseUrl}/api/v2/user_rates?user_id=${userId}&target_id=${titleId}&target_type=${entityType}`;
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

            const userData = userMap.get(userId);
            const commentId = comment.id;
    
            // Проверяем, есть ли кнопка
            if (!existingButton) {
                const scoreButton = document.createElement('button');
                scoreButton.textContent = 'Load';
                scoreButton.style.marginLeft = '5px';
                scoreButton.className = 'user-score-btn';
                scoreButton.id = `score-btn-${commentId}`;
                scoreButton.style.lineHeight = 'normal';
    
                // Добавляем обработчик
                attachButtonListener(scoreButton, userId);
    
                userNameElement.parentNode.insertBefore(scoreButton, userNameElement.nextSibling);
    
                if (userData.showStats) {
                    setCommentStats(commentId, userData);
                }
            } else {
                console.log(userId);
                attachButtonListener(existingButton, userId);

                if (userData.showStats) {
                    setCommentStats(commentId, userData);
                }
                else {
                    resetButton(commentId);
                }
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
    }
    
    // Функция для добавления комментария пользователя в userMap
    function addCommentToMap(userId, commentId) {
        if (!userMap.has(userId)) {
            userMap.set(userId, { status: 'N/A', score: 'N/A', showStats: false, comments: [], statsLoaded: false });
        }
        const userData = userMap.get(userId);
        if (!userData.comments.includes(commentId)) {
            userData.comments.push(commentId);
        }
    }

    // Функция для инициализации массива комментариев
    function initComments(comments) {
        console.log(`Processing ${comments.length} comments...`);

        for (const comment of comments) {
            const userId = comment.getAttribute('data-user_id');
            if (userId) {
                addCommentToMap(userId, comment.id);
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
    
        // Определяем тип по URL
        if (url.includes(`${baseUrl}/animes/`) || url.includes(`${baseUrl}/forum/animanga/anime`)) {
            titleType = 'Anime';
        } else if (url.includes(`${baseUrl}/mangas/`) || url.includes(`${baseUrl}/forum/animanga/manga`)) {
            titleType = 'Manga';
        } else if (url.includes(`${baseUrl}/ranobe/`) || url.includes(`${baseUrl}/forum/animanga/ranobe`)) {
            titleType = 'Ranobe';
        }
    
        // Если не удалось определить тип
        if (!titleType) {
            console.log('URL does not match expected patterns. Stopping script.');
            return;
        }

        entityType = (titleType == 'Ranobe') ? 'Manga' : titleType;
    
        console.log(`Detected title type: ${titleType}`);
        console.log(`Detected entity type: ${entityType}`);
    
        titleId = getTitleIdFromUrl(titleType);
        console.log(`ID from URL: ${titleId}`);
    
        const initialComments = document.querySelectorAll('.b-comment');
        initComments(initialComments);
    
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
