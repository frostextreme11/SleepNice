import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AnalysisData, SleepEvent, SleepStage } from '../types';
import { analyzeSleepAudio, getHealthSuggestions } from '../services/api';
import { addSleepSession } from '../services/db';
import { BedIcon, CoughIcon, SnoreIcon, TalkIcon, FartIcon, MovementIcon, OtherIcon, PlayIcon, PauseIcon } from './Icons';

type TrackerStatus = 'idle' | 'requesting' | 'tracking' | 'analyzing' | 'results' | 'error';

interface SleepTrackerProps {
  onTrackingChange: (isTracking: boolean) => void;
}

const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};


const SleepTracker: React.FC<SleepTrackerProps> = ({ onTrackingChange }) => {
    const [status, setStatus] = useState<TrackerStatus>('idle');
    const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
    const [healthSuggestions, setHealthSuggestions] = useState<string>('');
    const [error, setError] = useState<string[]>([]);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const liveAudioElRef = useRef<HTMLAudioElement>(null);
    
    const [duration, setDuration] = useState(0);
    const timerIntervalRef = useRef<number | null>(null);
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    
    
    useEffect(() => {
        const isCurrentlyOn = status === 'tracking' || status === 'analyzing' || status === 'requesting';
        onTrackingChange(isCurrentlyOn);
    }, [status, onTrackingChange]);

    const cleanup = useCallback(() => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        if (liveAudioElRef.current) {
            liveAudioElRef.current.srcObject = null;
        }
    },[]);

    useEffect(() => {
        return () => {
            cleanup();
        }
    }, [cleanup]);


    const handleStopAndAnalyze = useCallback(async () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.onstop = async () => {
                setStatus('analyzing');
                 if (audioChunksRef.current.length === 0) {
                     setError(['[Final Check] No audio chunks were recorded. The stream might have been silent or stopped unexpectedly.']);
                     setStatus('error');
                     cleanup();
                     return;
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                setAudioURL(URL.createObjectURL(audioBlob));
                
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = (reader.result as string).split(',')[1];
                    try {
                        const analysisResult = await analyzeSleepAudio(base64Audio, duration);
                        const dataToSave: AnalysisData = { ...analysisResult, date: new Date().toISOString() };
                        setAnalysisData(dataToSave);
                        await addSleepSession(dataToSave);
                        
                        const suggestions = await getHealthSuggestions(dataToSave);
                        setHealthSuggestions(suggestions);
                        setStatus('results');

                    } catch (err) {
                        console.error(err);
                        setError([(err as Error).message || 'Failed to analyze sleep audio. Please try again.']);
                        setStatus('error');
                    } finally {
                        cleanup();
                    }
                };
            };
            mediaRecorderRef.current.stop();
        }
    }, [duration, cleanup]);


    const handleStartTracking = async () => {
        let debugLog: string[] = [];
        const updateError = (msg: string) => {
            debugLog.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
            setError([...debugLog]);
            setStatus('error');
            cleanup();
        };
        
        setStatus('requesting');
        debugLog.push('Starting...');
        
        if (!navigator.mediaDevices?.getUserMedia) {
            return updateError('Error: Media Devices API (getUserMedia) not supported on this browser.');
        }

        let stream: MediaStream;
        try {
            debugLog.push('Requesting microphone permissions...');
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream;
            debugLog.push('Permission granted & stream acquired.');
        } catch (err) {
            console.error(err);
            if (err instanceof Error && err.name === 'NotAllowedError') {
                 return updateError('Microphone access was denied. Please enable it in your browser settings.');
            }
            return updateError(`An unknown error occurred while accessing the microphone: ${(err as Error).message}`);
        }
        
        if (!stream.active || stream.getAudioTracks().length === 0) {
            return updateError('Error: The acquired audio stream is not active or has no tracks.');
        }
        
        const track = stream.getAudioTracks()[0];
        debugLog.push(`Track state: ${track.readyState}`);
        if(track.readyState !== 'live') {
             return updateError(`Error: Audio track is not live. Current state: ${track.readyState}`);
        }

        // Keep stream alive
        if (liveAudioElRef.current) {
             liveAudioElRef.current.srcObject = stream;
             debugLog.push('Attached stream to hidden audio element to keep it alive.');
        }

        try {
            debugLog.push('Creating MediaRecorder...');
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            debugLog.push('MediaRecorder created successfully.');
        } catch (e) {
            return updateError(`Failed to create MediaRecorder: ${(e as Error).message}`);
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (event) => {
            if(event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorderRef.current.onerror = (event) => {
            updateError(`A recording error occurred: ${(event as any)?.error?.name || 'Unknown Recorder Error'}`);
        };

        // This is handled by handleStopAndAnalyze now
        mediaRecorderRef.current.onstop = null; 

        mediaRecorderRef.current.start(1000);
        debugLog.push('Recording started.');

        setDuration(0);
        setSessionStartTime(Date.now());
        timerIntervalRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
        setStatus('tracking');
    };

    const resetState = () => {
        if (audioURL) URL.revokeObjectURL(audioURL);
        cleanup();
        setStatus('idle');
        setAnalysisData(null);
        setHealthSuggestions('');
        setError([]);
        setDuration(0);
        setAudioURL(null);
        setSessionStartTime(null);
    };


    return (
        <div className="h-full w-full">
            <audio ref={liveAudioElRef} muted playsInline style={{ display: 'none' }} />
            <AnimatePresence mode="wait">
                {status === 'idle' && <IdleView onStart={handleStartTracking} />}
                {status === 'tracking' && <TrackingView onStop={handleStopAndAnalyze} duration={duration}/>}
                {(status === 'analyzing' || status === 'requesting') && <LoadingView status={status} />}
                {status === 'results' && analysisData && sessionStartTime && audioURL && <ResultsView data={analysisData} suggestions={healthSuggestions} onDone={resetState} sessionStartTime={sessionStartTime} audioURL={audioURL} />}
                {status === 'error' && <ErrorView messages={error} onRetry={resetState} />}
            </AnimatePresence>
        </div>
    );
};


const IdleView: React.FC<{ onStart: () => void }> = ({ onStart }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex flex-col items-center justify-center h-full p-8 text-center"
    >
        <motion.div 
          animate={{ y: [0, -10, 0]}}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <BedIcon />
        </motion.div>
        <h1 className="text-4xl font-bold mt-4">Sleep Tracker</h1>
        <p className="text-gray-400 mt-2 mb-8 max-w-sm">Start a session to record and analyze your sleep patterns with AI.</p>
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStart}
            className="bg-gradient-to-r from-brand-secondary to-purple-500 text-white font-bold py-4 px-12 rounded-full text-xl shadow-lg shadow-brand-secondary/30"
        >
            Start Session
        </motion.button>
    </motion.div>
);

const TrackingView: React.FC<{ onStop: () => void; duration: number }> = ({ onStop, duration }) => {
    const [isDim, setIsDim] = useState(false);
    const fullscreenRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (fullscreenRef.current && document.fullscreenElement !== fullscreenRef.current) {
                    await fullscreenRef.current.requestFullscreen();
                }
            } catch (err) {
                console.error("Could not enter fullscreen mode:", err);
            }
        };
        enterFullscreen();
        
        const dimTimeout = setTimeout(() => setIsDim(true), 5000);

        return () => {
            clearTimeout(dimTimeout);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.error("Could not exit fullscreen:", err));
            }
        };
    }, []);

    const handleInteraction = () => {
        if (isDim) setIsDim(false);
    };
    
    useEffect(() => {
        let timeout: number;
        if (!isDim) {
            timeout = window.setTimeout(() => setIsDim(true), 5000);
        }
        return () => clearTimeout(timeout);
    }, [isDim]);

    return (
        <div 
            ref={fullscreenRef}
            className={`fixed inset-0 z-40 transition-colors duration-1000 ${isDim ? 'bg-black' : 'bg-brand-background'}`}
            onClick={handleInteraction}
        >
            <AnimatePresence>
            {!isDim && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col items-center justify-center h-full text-white"
                >
                    <p className="text-xl">Tracking Sleep</p>
                    <p className="font-bold my-4 tabular-nums text-7xl lg:text-8xl">{formatDuration(duration)}</p>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); onStop(); }}
                        className="bg-red-600 text-white font-bold py-4 px-12 rounded-full text-xl"
                    >
                        End Session
                    </motion.button>
                     <p className="text-gray-400 mt-8 text-sm">Tap screen to wake. Dims in 5 seconds.</p>
                </motion.div>
            )}
            </AnimatePresence>
        </div>
    );
};

const LoadingView: React.FC<{status: 'analyzing' | 'requesting'}> = ({status}) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center justify-center h-full text-center"
    >
        <div className="w-16 h-16 border-4 border-t-brand-primary border-gray-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-xl">
            {status === 'requesting' ? 'Starting session...' : 'Analyzing your sleep...'}
        </p>
        <p className="text-gray-400 text-sm">This might take a moment.</p>
    </motion.div>
);

interface ResultsViewProps {
  data: AnalysisData;
  suggestions: string;
  onDone: () => void;
  sessionStartTime: number;
  audioURL: string;
}

const ResultsView: React.FC<ResultsViewProps> = ({ data, suggestions, onDone, sessionStartTime, audioURL }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentlyPlaying, setCurrentlyPlaying] = useState<{ index: number, timeoutId: number | null } | null>(null);

    const handlePlayPause = (event: SleepEvent, index: number) => {
        if (currentlyPlaying && currentlyPlaying.index === index) {
            if (currentlyPlaying.timeoutId) clearTimeout(currentlyPlaying.timeoutId);
            audioRef.current?.pause();
            setCurrentlyPlaying(null);
        } else {
            if (currentlyPlaying?.timeoutId) clearTimeout(currentlyPlaying.timeoutId);
            audioRef.current?.pause();

            if (audioRef.current) {
                audioRef.current.currentTime = event.time;
                audioRef.current.play().catch(e => console.error("Audio play failed", e));
                const timeoutId = window.setTimeout(() => {
                    audioRef.current?.pause();
                    setCurrentlyPlaying(null);
                }, event.duration * 1000);
                setCurrentlyPlaying({ index, timeoutId });
            }
        }
    };
    
    useEffect(() => {
        return () => {
            if (currentlyPlaying?.timeoutId) {
                clearTimeout(currentlyPlaying.timeoutId);
            }
        };
    }, [currentlyPlaying]);

    const eventIcons: Record<SleepEvent['type'], React.ReactNode> = {
        'Snore': <SnoreIcon />, 'Talk': <TalkIcon />, 'Cough': <CoughIcon />,
        'Fart': <FartIcon />, 'Movement': <MovementIcon />, 'Other': <OtherIcon />,
    };
    const stageColors: Record<SleepStage['stage'], string> = {
        'Awake': 'bg-yellow-400', 'Light': 'bg-blue-400',
        'Deep': 'bg-indigo-600', 'REM': 'bg-purple-500',
    };
    const getScoreColor = (score: number) => {
        if (score > 85) return 'text-brand-primary';
        if (score > 60) return 'text-yellow-400';
        return 'text-red-500';
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 space-y-4 pb-28">
             <audio ref={audioRef} src={audioURL} preload="auto" className="hidden" />
            <h1 className="text-3xl font-bold text-center">Sleep Analysis</h1>
            
            <div className="bg-brand-surface rounded-2xl p-6 text-center border border-white/10 flex flex-col items-center">
                <p className="text-gray-400">Sleep Score</p>
                <div className={`text-7xl font-bold ${getScoreColor(data.sleepScore)}`}>{data.sleepScore}</div>
                <p className="text-gray-300 mt-2 max-w-xs">{data.summary}</p>
            </div>

            <div className="bg-brand-surface rounded-2xl p-4 border border-white/10">
                <h2 className="font-semibold mb-3">Sleep Timeline</h2>
                <div className="w-full flex h-8 rounded-lg overflow-hidden bg-brand-background relative">
                    {data.stages.map((stage, index) => (
                        <div key={index} className={`relative group h-full ${stageColors[stage.stage]}`} style={{ width: `${((stage.endTime - stage.startTime) / data.duration) * 100}%` }}>
                           <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {stage.stage}: {formatDuration(stage.endTime - stage.startTime)}
                           </span>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2 px-1">
                    <span>{new Date(sessionStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span>{new Date(sessionStartTime + data.duration * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            </div>

            <div className="bg-brand-surface rounded-2xl p-4 border border-white/10">
                <h2 className="font-semibold mb-2">AI Suggestions</h2>
                <div className="text-gray-300 prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: suggestions }}></div>
                <p className="text-xs text-gray-500 mt-4">*This is not medical advice. Consult a professional for health concerns.</p>
            </div>

            <div className="bg-brand-surface rounded-2xl p-4 border border-white/10">
                <h2 className="font-semibold mb-3">Recorded Events</h2>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                    {data.events.length > 0 ? data.events.map((event, index) => (
                        <div key={index} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-white/5">
                            <button onClick={() => handlePlayPause(event, index)} className="p-1 rounded-full text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50">
                                {currentlyPlaying?.index === index ? <PauseIcon /> : <PlayIcon />}
                            </button>
                            <div className="text-brand-secondary w-10 shrink-0 flex justify-center">{eventIcons[event.type]}</div>
                            <div className="font-medium text-gray-300 w-20 shrink-0">{new Date(sessionStartTime + event.time * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            <div className="text-white grow">{event.type}</div>
                            <div className="text-gray-500 text-xs italic truncate hidden sm:block">"{event.description}"</div>
                        </div>
                    )) : <p className="text-gray-400 text-center py-4">No significant sound events detected.</p>}
                </div>
            </div>

            <button onClick={onDone} className="w-full mt-2 bg-brand-primary text-black font-bold p-3 rounded-lg">Done</button>
        </motion.div>
    );
};

const ErrorView: React.FC<{ messages: string[]; onRetry: () => void }> = ({ messages, onRetry }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full p-4 text-center"
    >
        <h1 className="text-2xl font-bold text-red-500">An Error Occurred</h1>
        <div className="bg-brand-surface w-full max-w-md my-4 p-3 rounded-lg text-left text-xs font-mono text-red-300 overflow-x-auto">
           <p className="font-bold mb-2">Debug Log:</p>
           {messages.map((msg, i) => <p key={i}>{msg}</p>)}
           {messages.length === 0 && <p>No specific error message was provided.</p>}
        </div>
        <button onClick={onRetry} className="bg-brand-secondary text-white font-bold py-3 px-8 rounded-full">
            Try Again
        </button>
    </motion.div>
);


export default SleepTracker;