import type { AnalysisData } from '../types';

const API_ENDPOINT = '/.netlify/functions/gemini';

async function postToApi<T>(type: string, payload: any): Promise<T> {
    const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, payload }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown API error occurred.' }));
        throw new Error(errorData.error || 'Failed to fetch data from API.');
    }

    return response.json();
}

export function analyzeSleepAudio(audioBase64: string, duration: number): Promise<Omit<AnalysisData, 'date'>> {
    return postToApi('analyzeSleepAudio', { audioBase64, duration });
}

export async function getHealthSuggestions(analysis: AnalysisData): Promise<string> {
    const result = await postToApi<{ suggestions: string }>('getHealthSuggestions', analysis);
    return result.suggestions;
}

export async function getWeeklyAnalysis(history: AnalysisData[]): Promise<string> {
    const result = await postToApi<{ analysis: string }>('getWeeklyAnalysis', history);
    return result.analysis;
}

export async function getHistoricalAnalysis(history: AnalysisData[]): Promise<string> {
    const result = await postToApi<{ analysis: string }>('getHistoricalAnalysis', history);
    return result.analysis;
}
