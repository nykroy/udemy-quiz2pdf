document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generatePDF');
    const status = document.getElementById('status');

    generateButton.addEventListener('click', async () => {
        try {
            status.textContent = 'Checking page...';

            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Make sure we're on a Udemy quiz page
            if (!tab.url.includes('udemy.com')) {
                throw new Error('Please navigate to a Udemy quiz page first');
            }

            status.textContent = 'Capturing quiz data...';

            // Send message to content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'captureQuizData'
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to capture quiz data');
            }

            status.textContent = `Generating PDF... (${response.data?.length || 0} questions)`;

            // Pass both data and title to generatePDF
            await generatePDF(response.data, response.title);

            status.textContent = `PDF generated! (${response.data?.length || 0} questions)`;
        } catch (error) {
            console.error('Error:', error);
            status.textContent = `Error: ${error.message}`;
        }
    });
});

async function generatePDF(questions, title) {
    const docDefinition = {
        content: [
            { text: title, style: 'title' },
            { text: 'Questions', style: 'header' },
            ...generateQuestionsContent(questions),
            { text: 'Answer Key', style: 'header', pageBreak: 'before' },
            ...generateAnswerKeyContent(questions)
        ],
        styles: {
            title: {
                fontSize: 20,
                bold: true,
                margin: [0, 0, 0, 20]
            },
            header: {
                fontSize: 18,
                bold: true,
                margin: [0, 0, 0, 10]
            },
            questionNumber: {
                fontSize: 14,
                bold: true,
                margin: [0, 15, 0, 5]
            },
            questionText: {
                fontSize: 12,
                margin: [0, 5, 0, 10]
            },
            answer: {
                fontSize: 12,
                margin: [20, 2, 0, 2]
            },
            answerKey: {
                fontSize: 12,
                margin: [0, 5, 0, 5]
            }
        }
    };

    // Generate filename from title
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

    // Generate and download the PDF
    pdfMake.createPdf(docDefinition).download(filename);
}

function cleanHtml(text) {
    if (!text) return '';

    // Replace <br> and <br/> with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Replace block-level closing tags with newlines for readability
    text = text.replace(/<\/(?:p|div|li|h[1-6]|pre|blockquote|tr)>/gi, '\n');

    // Replace <li> opening with bullet
    text = text.replace(/<li[^>]*>/gi, '• ');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&apos;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Clean up excessive whitespace
    text = text.replace(/[ \t]+/g, ' ');           // collapse horizontal spaces
    text = text.replace(/\n[ \t]+/g, '\n');         // trim leading spaces on lines
    text = text.replace(/[ \t]+\n/g, '\n');         // trim trailing spaces on lines
    text = text.replace(/\n{3,}/g, '\n\n');         // max 2 consecutive newlines

    return text.trim();
}

function generateQuestionsContent(questions) {
    const content = [];

    questions.forEach((q, i) => {
        content.push(
            { text: `Question ${i + 1}:`, style: 'questionNumber' },
            { text: cleanHtml(q.question), style: 'questionText' }
        );

        q.answers.forEach((answer, j) => {
            const letter = String.fromCharCode(97 + j); // a, b, c, etc.
            content.push({ text: `${letter}. ${cleanHtml(answer)}`, style: 'answer' });
        });
    });

    return content;
}

function generateAnswerKeyContent(questions) {
    const content = [];

    questions.forEach((q, i) => {
        const correctAnswers = q.correct_response.map(letter => {
            const index = letter.charCodeAt(0) - 97; // Convert letter to index
            return `${letter}. ${cleanHtml(q.answers[index])}`;
        }).join('\n');

        content.push({
            text: [
                { text: `Question ${i + 1}: `, style: 'questionNumber' },
                { text: correctAnswers, style: 'answerKey' }
            ]
        });
    });

    return content;
}
