// Notify that content script is loaded
console.log("Udemy Quiz PDF Generator content script loaded");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);

    if (request.action === "captureQuizData") {
        captureQuizData().then(data => {
            console.log("Quiz data captured:", data);
            sendResponse(data);
        });
        return true; // Will respond asynchronously
    }
});

async function captureQuizData() {
    try {
        // Extract quiz ID from URL
        const quizId = window.location.pathname.match(/\/quiz\/(\d+)/)?.[1];
        if (!quizId) {
            return {
                success: false,
                error: "No quiz ID found in URL"
            };
        }

        // Get course ID from the app loader div
        const appLoader = document.querySelector('.ud-app-loader');
        if (!appLoader) {
            return {
                success: false,
                error: "Could not find course data"
            };
        }

        const moduleArgs = JSON.parse(appLoader.getAttribute('data-module-args'));
        const courseId = moduleArgs.courseId;

        // Get quiz metadata (including title)
        const quizMetaResponse = await fetch(`https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/quizzes/${quizId}/?draft=false&fields[quiz]=title`);
        const quizMeta = await quizMetaResponse.json();
        console.log("Quiz metadata:", quizMeta);
        const quizTitle = quizMeta.title || 'Udemy Quiz';

        // Then fetch quiz questions data
        const response = await fetch(`https://www.udemy.com/api-2.0/quizzes/${quizId}/assessments/?version=10&page_size=250&fields[assessment]=id,title,assessment_type,prompt,correct_response,section,question_plain,related_lectures&use_remote_version=true`);
        const data = await response.json();

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