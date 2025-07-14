import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { AnalysisData } from '../../types';

const apiKey = process.env.API_KEY;
if (!apiKey) {
    throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey });

// Re-defining schemas and helpers from the original service file
const analysisSchema = {
    type: Type.OBJECT,
    properties: {
        sleepScore: { type: Type.NUMBER, description: "A holistic sleep quality score from 0 to 100." },
        summary: { type: Type.STRING, description: "A concise, one-sentence summary of the sleep quality." },
        events: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { time: { type: Type.NUMBER }, type: { type: Type.STRING, enum: ['Snore', 'Talk', 'Cough', 'Fart', 'Movement', 'Other'] }, description: { type: Type.STRING }, duration: { type: Type.NUMBER } }, required: ['time', 'type', 'description', 'duration'] } },
        stages: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { stage: { type: Type.STRING, enum: ['Awake', 'Light', 'Deep', 'REM'] }, startTime: { type: Type.NUMBER }, endTime: { type: Type.NUMBER } }, required: ['stage', 'startTime', 'endTime'] } },
        duration: { type: Type.NUMBER, description: "The total duration of the recording in seconds." }
    },
    required: ['sleepScore', 'summary', 'events', 'stages', 'duration']
};
function formatDurationPrompt(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours} hours and ${minutes} minutes` : `${minutes} minutes`;
}

// --- API Logic ---
async function handleAnalyzeSleepAudio(payload: any) {
    const { audioBase64, duration } = payload;
    if (!audioBase64 || typeof duration !== 'number') throw new Error("Missing audio data or duration.");

    const audioPart = { inlineData: { mimeType: 'audio/webm', data: audioBase64 } };
    const prompt = `You are a sleep analysis expert AI. Analyze this audio recording of a person's sleep. The total duration is ${duration} seconds. The audio has been pre-filtered with a noise gate, so only analyze audible events and treat quiet periods as silence.
    1.  Calculate a holistic sleep score from 0-100.
    2.  Provide a concise, one-sentence summary of the night's sleep.
    3.  Identify significant sound events. For each, provide its start time, type, a brief description, and its duration in seconds.
    4.  Infer sleep stages (Awake, Light, Deep, REM). The sum of stage durations must equal the total recording duration.
    5.  Return the complete analysis in the provided JSON schema. Ensure all fields are filled accurately.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }, audioPart] },
        config: { responseMimeType: "application/json", responseSchema: analysisSchema }
    });
    return JSON.parse(response.text.trim());
}

async function handleGetHealthSuggestions(payload: any) {
    const analysis = payload as AnalysisData;
    const prompt = `Based on the following sleep analysis, provide 2-3 brief, friendly, and encouraging suggestions for improving sleep quality.
    - Summary: ${analysis.summary}
    - Sleep Score: ${analysis.sleepScore}/100
    - Total sleep time: ${formatDurationPrompt(analysis.duration)}
    Format the response as simple, easy-to-read HTML using <p> and <ul>/<li> tags. Do NOT give medical advice. Frame suggestions as general wellness tips. Start with a positive observation if possible.`;

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return { suggestions: response.text };
}

async function handleGetWeeklyAnalysis(payload: any) {
    const history = payload as AnalysisData[];
    const historySummary = history.map(entry => ({ date: entry.date.split('T')[0], score: entry.sleepScore, durationInHours: (entry.duration / 3600).toFixed(1), events: entry.events.reduce((acc, event) => { acc[event.type] = (acc[event.type] || 0) + 1; return acc; }, {} as Record<string, number>) }));
    
    const prompt = `You are a sleep coach AI. Based on the user's sleep data from this past week, provide a friendly and actionable summary. Data: ${JSON.stringify(historySummary, null, 2)}
    Your analysis should:
    1. Start with a positive opening remark.
    2. Analyze sleep consistency.
    3. Identify the most frequent sound events and provide specific, practical, non-medical suggestions for the top 1-2.
    4. Conclude with a motivational tip.
    5. Format in readable HTML using <p>, <strong>, and <ul>/<li> tags. Do NOT give medical advice.`;
    
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return { analysis: response.text };
}

async function handleGetHistoricalAnalysis(payload: any) {
    const history = payload as AnalysisData[];
    const historySummary = history.map(entry => ({ date: entry.date.split('T')[0], score: entry.sleepScore, durationInHours: (entry.duration / 3600).toFixed(1), summary: entry.summary }));

    const prompt = `You are a sleep coach AI. Based on the following sleep data from the last 30 days, provide a friendly, insightful analysis of patterns and trends. Data: ${JSON.stringify(historySummary, null, 2)}
    Your analysis should:
    1. Start with a positive opening remark.
    2. Identify key trends or patterns.
    3. Highlight 1-2 areas for improvement constructively.
    4. Provide 2-3 actionable, long-term suggestions.
    5. Use a supportive tone, format in readable HTML using <p>, <strong>, and <ul>/<li> tags, and give NO medical advice.`;

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return { analysis: response.text };
}


const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { type, payload } = body;
        let result;

        switch (type) {
            case 'analyzeSleepAudio':
                result = await handleAnalyzeSleepAudio(payload);
                break;
            case 'getHealthSuggestions':
                result = await handleGetHealthSuggestions(payload);
                break;
            case 'getWeeklyAnalysis':
                result = await handleGetWeeklyAnalysis(payload);
                break;
            case 'getHistoricalAnalysis':
                result = await handleGetHistoricalAnalysis(payload);
                break;
            default:
                throw new Error(`Unknown API call type: ${type}`);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }),
        };
    }
};

export { handler };