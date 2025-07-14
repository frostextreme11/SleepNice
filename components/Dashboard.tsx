import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AnalysisData } from '../types';
import { getHistoricalAnalysis, getWeeklyAnalysis } from '../services/api';
import { getSleepHistory } from '../services/db';
import { BedIcon } from './Icons';

type TimeRange = 'week' | 'month' | 'year';

const Dashboard: React.FC = () => {
    const [history, setHistory] = useState<AnalysisData[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>('week');
    
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const storedHistory = await getSleepHistory();
                setHistory(storedHistory);
            } catch (e) {
                console.error("Failed to load sleep history from IndexedDB", e);
            }
        };
        loadHistory();
    }, []);

    const filteredData = useMemo(() => {
        const baseDate = new Date();
        const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365;
        const cutoffDate = new Date(baseDate.setDate(baseDate.getDate() - days));
        return history.filter(item => new Date(item.date) >= cutoffDate);
    }, [history, timeRange]);

    if (history.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="p-4 space-y-6 text-white">
            <header>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-gray-400">Your sleep trends at a glance.</p>
            </header>
            
            <TimeRangeSelector currentTimeRange={timeRange} setTimeRange={setTimeRange} />

            <AnimatePresence mode="wait">
                <motion.div
                    key={timeRange}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                >
                    {filteredData.length > 0 ? (
                        <DashboardContent data={filteredData} timeRange={timeRange} />
                    ) : (
                        <NoDataForRange />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

const TimeRangeSelector: React.FC<{currentTimeRange: TimeRange, setTimeRange: (range: TimeRange) => void}> = ({ currentTimeRange, setTimeRange }) => {
    const ranges: {id: TimeRange, label: string}[] = [
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
        { id: 'year', label: 'Year' },
    ];
    return (
        <div className="flex w-full p-1 bg-brand-surface rounded-full border border-white/10">
            {ranges.map(range => (
                <button
                    key={range.id}
                    onClick={() => setTimeRange(range.id)}
                    className="w-1/3 rounded-full py-2 text-sm font-semibold transition-colors relative"
                >
                    <span className={`relative z-10 ${currentTimeRange === range.id ? 'text-black' : 'text-white'}`}>
                        {range.label}
                    </span>
                    {currentTimeRange === range.id && (
                        <motion.div 
                            layoutId="timeRangePill"
                            className="absolute inset-0 bg-brand-primary rounded-full"
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        />
                    )}
                </button>
            ))}
        </div>
    );
};

const DashboardContent: React.FC<{data: AnalysisData[], timeRange: TimeRange}> = ({ data, timeRange }) => {
    const avgScore = useMemo(() => Math.round(data.reduce((acc, item) => acc + item.sleepScore, 0) / data.length), [data]);
    const avgDuration = useMemo(() => data.reduce((acc, item) => acc + item.duration, 0) / data.length, [data]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Avg. Score" value={avgScore.toString()} unit="/ 100" />
                <MetricCard label="Avg. Duration" value={formatHours(avgDuration)} unit="hrs" />
            </div>

            <Chart title="Sleep Score" data={data.map(d => ({ value: d.sleepScore, label: d.date }))} max={100} unit="/100" color="bg-brand-primary" />
            <Chart title="Sleep Duration (hours)" data={data.map(d => ({ value: d.duration / 3600, label: d.date }))} max={12} unit="h" color="bg-brand-secondary" />
            
            <DailyDetailsSlider data={data} />
            
            {timeRange === 'week' && <WeeklyAnalysis data={data} />}
            {timeRange === 'month' && <MonthlyAnalysis data={data} />}
        </div>
    );
};

const MetricCard: React.FC<{label: string, value: string, unit: string}> = ({ label, value, unit }) => (
    <div className="bg-brand-surface p-4 rounded-2xl border border-white/10">
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-3xl font-bold">{value}<span className="text-xl font-medium text-gray-400">{unit}</span></p>
    </div>
);

const Chart: React.FC<{title: string, data: {value: number, label: string}[], max: number, unit: string, color: string}> = ({ title, data, max, unit, color }) => (
    <div className="bg-brand-surface p-4 rounded-2xl border border-white/10">
        <h3 className="font-semibold mb-4">{title}</h3>
        <div className="flex gap-2 items-end h-32">
            {data.slice(0, 30).reverse().map((item, index) => (
                <div key={index} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                    <motion.div
                        className={`w-full rounded-t-sm ${color}`}
                        initial={{ height: 0 }}
                        animate={{ height: `${(item.value / max) * 100}%` }}
                        transition={{ duration: 0.5, delay: index * 0.02, ease: 'easeOut' }}
                    />
                    <span className="text-[10px] text-gray-500 mt-1">{new Date(item.label).getDate()}</span>
                    <div className="absolute -top-8 bg-black text-white px-2 py-1 text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {item.value.toFixed(1)} {unit}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const DailyDetailsSlider: React.FC<{data: AnalysisData[]}> = ({data}) => {
    const sliderRef = useRef<HTMLDivElement>(null);
    return (
        <div>
            <h3 className="font-semibold mb-2">Daily Details</h3>
            <div ref={sliderRef} className="overflow-x-auto cursor-grab active:cursor-grabbing no-scrollbar">
                <motion.div
                    drag="x"
                    dragConstraints={sliderRef}
                    className="flex gap-3 p-1"
                >
                    {data.map((item, index) => (
                        <div key={index} className="bg-brand-surface border border-white/10 rounded-xl p-4 w-60 flex-shrink-0">
                            <p className="font-semibold text-sm">{new Date(item.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                            <p className="text-3xl font-bold my-1">{item.sleepScore} <span className="text-lg text-gray-400">/ 100</span></p>
                            <p className="text-xs text-gray-400 truncate">{item.summary}</p>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    );
};

const WeeklyAnalysis: React.FC<{data: AnalysisData[]}> = ({data}) => {
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleFetchAnalysis = async () => {
        setIsLoading(true);
        try {
            const result = await getWeeklyAnalysis(data);
            setAnalysis(result);
        } catch(e) {
            console.error(e);
            setAnalysis("Sorry, couldn't fetch your weekly feedback. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="bg-brand-surface p-4 rounded-2xl border border-white/10">
            <h3 className="font-semibold mb-2">Your Weekly Feedback</h3>
            {analysis ? (
                <div className="text-gray-300 prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: analysis }}></div>
            ) : (
                <>
                    <p className="text-sm text-gray-400 mb-4">Get AI-powered feedback on your last 7 days of sleep and actionable tips.</p>
                    <button onClick={handleFetchAnalysis} disabled={isLoading} className="w-full bg-brand-secondary text-white font-bold p-3 rounded-lg disabled:opacity-50">
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto" />
                        ) : (
                            "Get Weekly Feedback"
                        )}
                    </button>
                </>
            )}
        </div>
    );
};

const MonthlyAnalysis: React.FC<{data: AnalysisData[]}> = ({data}) => {
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleFetchAnalysis = async () => {
        setIsLoading(true);
        try {
            const result = await getHistoricalAnalysis(data);
            setAnalysis(result);
        } catch(e) {
            console.error(e);
            setAnalysis("Sorry, couldn't fetch analysis. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="bg-brand-surface p-4 rounded-2xl border border-white/10">
            <h3 className="font-semibold mb-2">Your Monthly Check-in</h3>
            {analysis ? (
                <div className="text-gray-300 prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: analysis }}></div>
            ) : (
                <>
                    <p className="text-sm text-gray-400 mb-4">Get AI-powered insights on your sleep patterns over the last 30 days.</p>
                    <button onClick={handleFetchAnalysis} disabled={isLoading} className="w-full bg-brand-secondary text-white font-bold p-3 rounded-lg disabled:opacity-50">
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto" />
                        ) : (
                            "Get Monthly Analysis"
                        )}
                    </button>
                </>
            )}
        </div>
    );
};

const EmptyState: React.FC = () => (
    <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-[calc(100vh-250px)] text-center text-gray-400 p-8"
    >
        <BedIcon />
        <h2 className="text-xl font-bold text-white mt-4">No Sleep Data Yet</h2>
        <p>Track your sleep to see your analysis here.</p>
    </motion.div>
);

const NoDataForRange: React.FC = () => (
     <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-10 text-gray-400 bg-brand-surface rounded-2xl"
    >
        <p>No sleep data found for this time period.</p>
    </motion.div>
);

// Helpers
const formatHours = (seconds: number): string => (seconds / 3600).toFixed(1);

export default Dashboard;