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
            console.log("Sending message to content script...");
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'captureQuizData'
            });

            console.log("Received response:", response);

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to capture quiz data');
            }

            status.textContent = 'Generating PDF...';

            // Pass both data and title to generatePDF
            await generatePDF(response.data, response.title);

            status.textContent = 'PDF generated successfully!';
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
    // Remove img tags and their content
    text = text.replace(/<img[^>]+>/g, '');

    // Remove links but keep their text
    text = text.replace(/<a[^>]*>(.*?)<\/a>/g, '$1');
    text = text.replace(/<p[^>]*>(.*?)<\/p>/g, '$1');

    // Convert <strong> to bold tags (pdfmake handles bold differently)
    text = text.replace(/<strong>(.*?)<\/strong>/g, '$1');  // We'll handle bold with styling

    // Remove other problematic tags
    text = text.replace(/<code>|<\/code>|<pre>|<\/pre>/g, '');

    // Clean up any double spaces or newlines
    text = text.replace(/\s+/g, ' ');

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