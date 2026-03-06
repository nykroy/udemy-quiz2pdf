// Notify that content script is loaded
console.log("Udemy Quiz PDF Generator content script loaded");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "captureQuizData") {
        captureQuizData().then(data => {
            sendResponse(data);
        });
        return true; // Will respond asynchronously
    }
});

async function captureQuizData() {
    try {
        // Get course ID from the app loader div
        const appLoader = document.querySelector('.ud-app-loader[data-module-id="course-taking"]') ||
                          document.querySelector('.ud-app-loader');
        if (!appLoader) {
            return {
                success: false,
                error: "Could not find course data"
            };
        }

        const moduleArgs = JSON.parse(appLoader.getAttribute('data-module-args'));
        const courseId = moduleArgs.courseId;

        // Find the quiz ID for the CURRENTLY SELECTED practice test
        const quizId = await getSelectedQuizId(courseId);
        if (!quizId) {
            return {
                success: false,
                error: "Could not determine the selected quiz ID"
            };
        }

        // Get quiz metadata (including title)
        const quizMetaResponse = await fetch(`https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/quizzes/${quizId}/?draft=false&fields[quiz]=title`);
        const quizMeta = await quizMetaResponse.json();
        const quizTitle = quizMeta.title || 'Udemy Quiz';

        // Try multiple API variants to find the one that returns questions
        const apiVariants = [
            `https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures`,
            `https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?version=1&page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures`,
            `https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?version=10&page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures&use_remote_version=true`,
            `https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?draft=false&page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures`,
            `https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?page_size=250`,
            `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/quizzes/${quizId}/assessments/?page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures`
        ];

        let data = null;
        for (const url of apiVariants) {
            try {
                const resp = await fetch(url);
                const json = await resp.json();
                if (json.results?.length > 0) {
                    data = json;
                    break;
                }
            } catch (e) {
                // Try next variant
            }
        }

        if (!data || !data.results || data.results.length === 0) {
            return {
                success: false,
                error: "No questions found for this quiz. The API returned 0 results."
            };
        }

        // Clean the data
        const cleanedData = cleanData(data);

        return {
            success: true,
            data: cleanedData,
            title: quizTitle
        };
    } catch (error) {
        console.error("Error capturing quiz data:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Determines the quiz ID of the currently selected practice test
async function getSelectedQuizId(courseId) {
    // Fetch the course curriculum to get all quiz IDs in order
    const curriculumResponse = await fetch(
        `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/?page_size=1400&fields[quiz]=id,title,type,sort_order&fields[chapter]=id,title,sort_order`
    );
    const curriculumData = await curriculumResponse.json();

    // Filter only quiz items (practice tests), keep them in order
    const quizzes = (curriculumData.results || []).filter(item => item._class === 'quiz');

    if (quizzes.length === 0) {
        return window.location.pathname.match(/\/quiz\/(\d+)/)?.[1];
    }

    // Strategy 1: Find the currently selected item in the sidebar via aria-current="true"
    const currentLi = document.querySelector('li[aria-current="true"].curriculum-item-link--curriculum-item--OVP5S') ||
                      document.querySelector('li[aria-current="true"]');

    if (currentLi) {
        // Try to get the index from data-purpose="curriculum-item-SECTION-INDEX"
        const itemLink = currentLi.querySelector('[data-purpose^="curriculum-item-"]');
        if (itemLink) {
            const match = itemLink.getAttribute('data-purpose').match(/curriculum-item-(\d+)-(\d+)/);
            if (match) {
                const itemIndex = parseInt(match[2]);
                if (itemIndex >= 0 && itemIndex < quizzes.length) {
                    return quizzes[itemIndex].id;
                }
            }
        }

        // Strategy 2: Match by title text
        const titleEl = currentLi.querySelector('[data-purpose="item-title"]');
        if (titleEl) {
            const sidebarTitle = titleEl.textContent.trim();
            const cleanTitle = sidebarTitle.replace(/^Practice Test \d+:\s*/i, '').trim();

            const matched = quizzes.find(q =>
                q.title === cleanTitle ||
                q.title === sidebarTitle ||
                sidebarTitle.includes(q.title) ||
                q.title.includes(cleanTitle)
            );
            if (matched) {
                return matched.id;
            }
        }
    }

    // Strategy 3: Try to find the active item via the "is-current" CSS class
    const currentByClass = document.querySelector('[class*="is-current"] [data-purpose="item-title"]');
    if (currentByClass) {
        const sidebarTitle = currentByClass.textContent.trim();
        const cleanTitle = sidebarTitle.replace(/^Practice Test \d+:\s*/i, '').trim();
        const matched = quizzes.find(q =>
            q.title === cleanTitle ||
            sidebarTitle.includes(q.title) ||
            q.title.includes(cleanTitle)
        );
        if (matched) {
            return matched.id;
        }
    }

    // Strategy 4: Fallback to URL-based quiz ID
    const urlQuizId = window.location.pathname.match(/\/quiz\/(\d+)/)?.[1];
    if (urlQuizId) {
        return urlQuizId;
    }

    // Strategy 5: Last resort - use initialCurriculumItemId from module args
    const appLoader = document.querySelector('.ud-app-loader[data-module-id="course-taking"]') ||
                      document.querySelector('.ud-app-loader');
    if (appLoader) {
        const args = JSON.parse(appLoader.getAttribute('data-module-args'));
        if (args.initialCurriculumItemId) {
            return args.initialCurriculumItemId;
        }
    }

    return null;
}

function cleanData(data) {
    const cleanedQuestions = [];

    const questions = data.results || [];

    for (const assessment of questions) {
        if (assessment._class === "assessment") {
            const cleanedQuestion = {
                question: assessment.prompt.question,
                answers: assessment.prompt.answers,
                correct_response: assessment.correct_response
            };
            cleanedQuestions.push(cleanedQuestion);
        }
    }

    return cleanedQuestions;
}
