import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Alarm } from '../types';
import { PlusIcon, TrashIcon } from './Icons';
import { getAllAlarms, saveAlarm, deleteAlarmDB } from '../services/db';


const AlarmClock: React.FC = () => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);
  const [ignoreForThisMinute, setIgnoreForThisMinute] = useState<string[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
      } catch (e) {
        console.error("Web Audio API is not supported in this browser.", e);
      }
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, [initAudio]);

  const stopAlarmSound = useCallback(() => {
    if (gainNodeRef.current && audioContextRef.current) {
        gainNodeRef.current.gain.cancelScheduledValues(audioContextRef.current.currentTime);
        gainNodeRef.current.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    }
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    if(gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
    }
  }, []);

  const playAlarmSound = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state !== 'running') {
      console.warn("AudioContext not ready. Cannot play sound.");
      return;
    }
    stopAlarmSound(); 

    const audioCtx = audioContextRef.current;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'square';
    oscillator.frequency.value = 880; 
    oscillator.start();

    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    for (let i = 0; i < 50; i++) {
      gainNode.gain.setValueAtTime(0.4, now + i * 0.8);
      gainNode.gain.setValueAtTime(0, now + i * 0.8 + 0.2);
      gainNode.gain.setValueAtTime(0.4, now + i * 0.8 + 0.4);
      gainNode.gain.setValueAtTime(0, now + i * 0.8 + 0.6);
    }

    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;
  }, [stopAlarmSound]);

  useEffect(() => {
    if (ringingAlarm) {
      playAlarmSound();
    } else {
      stopAlarmSound();
    }
    return () => stopAlarmSound();
  }, [ringingAlarm, playAlarmSound, stopAlarmSound]);
  
  useEffect(() => {
    const loadAlarms = async () => {
      try {
        const storedAlarms = await getAllAlarms();
        setAlarms(storedAlarms);
      } catch (error) {
        console.error("Failed to load alarms from IndexedDB", error);
      }
    };
    loadAlarms();
  }, []);

  const toggleAlarm = (id: string) => {
    setAlarms(currentAlarms => {
      const updatedAlarms = currentAlarms.map(a => 
        a.id === id ? { ...a, isActive: !a.isActive } : a
      );
      const alarmToSave = updatedAlarms.find(a => a.id === id);
      if (alarmToSave) {
        saveAlarm(alarmToSave).catch(e => {
          console.error("Failed to save toggled alarm", e);
          // Optionally revert state on error
        });
      }
      return updatedAlarms;
    });
  };

  const checkAlarms = useCallback(() => {
    if (ringingAlarm) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay();
    
    for (const alarm of alarms) {
      if (alarm.isActive && alarm.time === currentTime && !ignoreForThisMinute.includes(alarm.id) && (alarm.days.length === 0 || alarm.days.includes(currentDay))) {
        setRingingAlarm(alarm);
        if (alarm.days.length === 0) {
            const updatedAlarm = { ...alarm, isActive: false };
            saveAlarm(updatedAlarm)
                .then(() => {
                    setAlarms(prevAlarms => prevAlarms.map(a => a.id === alarm.id ? updatedAlarm : a));
                })
                .catch(e => console.error("Failed to disable one-time alarm", e));
        }
        break; 
      }
    }
  }, [alarms, ringingAlarm, ignoreForThisMinute]);

  useEffect(() => {
    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [checkAlarms]);
  
  const addAlarm = (alarm: Omit<Alarm, 'id'>) => {
    initAudio();
    const newAlarm: Alarm = { ...alarm, id: Date.now().toString() };
    saveAlarm(newAlarm)
      .then(() => {
        setAlarms(prev => [...prev, newAlarm].sort((a,b) => a.time.localeCompare(b.time)));
      })
      .catch(e => console.error("Failed to add alarm", e));
  };

  const deleteAlarm = (id: string) => {
    deleteAlarmDB(id)
      .then(() => {
        setAlarms(prev => prev.filter(a => a.id !== id));
      })
      .catch(e => console.error("Failed to delete alarm", e));
  };
  
  const stopRinging = () => {
    if (!ringingAlarm) return;
    const alarmId = ringingAlarm.id;
    
    setRingingAlarm(null);

    setIgnoreForThisMinute(prev => [...prev, alarmId]);
    setTimeout(() => {
        setIgnoreForThisMinute(prev => prev.filter(id => id !== alarmId));
    }, 61000);
  };

  return (
    <div className="p-4 text-white">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Alarms</h1>
        <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsModalOpen(true)} className="p-2 bg-brand-secondary rounded-full">
          <PlusIcon />
        </motion.button>
      </header>
      
      <motion.div layout className="space-y-4">
        <AnimatePresence>
        {alarms.length === 0 ? (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-10 text-gray-400"
            >
                <p>No alarms set.</p>
                <p className="text-sm">Tap the '+' to add one.</p>
            </motion.div>
        ) : (
          alarms.map((alarm) => (
            <AlarmCard key={alarm.id} alarm={alarm} onToggle={toggleAlarm} onDelete={deleteAlarm} />
          ))
        )}
        </AnimatePresence>
      </motion.div>

      <AddAlarmModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAdd={addAlarm} />
      {ringingAlarm && <RingingModal alarm={ringingAlarm} onStop={stopRinging} />}
    </div>
  );
};

interface AlarmCardProps {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const AlarmCard: React.FC<AlarmCardProps> = ({ alarm, onToggle, onDelete }) => {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = alarm.days.length > 0 ? alarm.days.map(d => daysOfWeek[d]).join(', ') : 'Once';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
            className="bg-brand-glass backdrop-blur-md p-4 rounded-2xl flex items-center justify-between border border-white/10"
        >
            <div className="flex items-center gap-4">
                <button onClick={() => onDelete(alarm.id)} className="text-red-500 hover:text-red-400">
                    <TrashIcon />
                </button>
                <div>
                    <p className={`text-4xl font-light ${alarm.isActive ? 'text-white' : 'text-gray-500'}`}>{alarm.time}</p>
                    <p className="text-sm text-gray-400">{alarm.label} | {activeDays}</p>
                </div>
            </div>
            <div 
                onClick={() => onToggle(alarm.id)}
                className={`w-14 h-8 rounded-full flex items-center cursor-pointer transition-colors duration-300 ${alarm.isActive ? 'bg-brand-primary' : 'bg-gray-600'}`}
            >
                <motion.div 
                    layout 
                    transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                    className={`w-6 h-6 bg-white rounded-full shadow-lg ${alarm.isActive ? 'ml-7' : 'ml-1'}`} 
                />
            </div>
        </motion.div>
    );
};

interface AddAlarmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (alarm: Omit<Alarm, 'id'>) => void;
}

const AddAlarmModal: React.FC<AddAlarmModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [time, setTime] = useState('07:00');
    const [label, setLabel] = useState('Wake Up');
    const [days, setDays] = useState<number[]>([]);

    if (!isOpen) return null;

    const handleSave = () => {
        onAdd({ time, label, isActive: true, days });
        onClose();
    };
    
    const toggleDay = (dayIndex: number) => {
        setDays(prev => prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]);
    };

    const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 50 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="bg-brand-surface w-11/12 max-w-sm rounded-2xl p-6 border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold mb-4">Add Alarm</h2>
                        <input 
                            type="time" 
                            value={time} 
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full bg-brand-background p-3 rounded-lg text-4xl text-center mb-4"
                        />
                        <input 
                            type="text" 
                            placeholder="Label" 
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full bg-brand-background p-3 rounded-lg mb-4"
                        />
                        <div className="flex justify-between mb-6">
                            {daysOfWeek.map((day, index) => (
                                <button key={index} onClick={() => toggleDay(index)} className={`w-9 h-9 rounded-full font-bold transition-colors ${days.includes(index) ? 'bg-brand-secondary text-white' : 'bg-brand-background text-gray-400'}`}>
                                    {day}
                                </button>
                            ))}
                        </div>
                        <button onClick={handleSave} className="w-full bg-brand-primary text-black font-bold p-3 rounded-lg">
                            Save
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

interface RingingModalProps {
    alarm: Alarm;
    onStop: () => void;
}

const RingingModal: React.FC<RingingModalProps> = ({ alarm, onStop }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex flex-col justify-center items-center z-50">
        <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
            className="text-center"
        >
            <p className="text-8xl font-bold text-brand-primary">{alarm.time}</p>
            <p className="text-2xl text-white mt-4">{alarm.label}</p>
        </motion.div>
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStop}
            className="mt-20 bg-red-600 text-white font-bold py-4 px-12 rounded-full text-xl"
        >
            Stop
        </motion.button>
    </div>
);


export default AlarmClock;