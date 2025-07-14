import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClockIcon, BedIcon, DashboardIcon } from './components/Icons';
import AlarmClock from './components/AlarmClock';
import SleepTracker from './components/SleepTracker';
import Dashboard from './components/Dashboard';

type View = 'alarms' | 'dashboard' | 'sleep';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('alarms');
  const [isTracking, setIsTracking] = useState(false);

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -20 },
  };

  const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: 0.5,
  } as const;

  return (
    <div className="h-screen w-screen flex flex-col bg-brand-background overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
            className="min-h-full"
          >
            {activeView === 'alarms' && <AlarmClock />}
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'sleep' && <SleepTracker onTrackingChange={setIsTracking} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {!isTracking && <BottomNav activeView={activeView} setActiveView={setActiveView} />}
      </AnimatePresence>
    </div>
  );
};

interface BottomNavProps {
  activeView: View;
  setActiveView: (view: View) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  const navItems: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: 'alarms', icon: <AlarmClockIcon />, label: 'Alarms' },
    { id: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard' },
    { id: 'sleep', icon: <BedIcon />, label: 'Sleep' },
  ];

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
      className="flex-shrink-0 h-20 bg-brand-glass backdrop-blur-lg border-t border-white/10"
    >
      <div className="flex justify-around items-center h-full max-w-md mx-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className="flex flex-col items-center justify-center gap-1 text-gray-400 transition-colors duration-300 w-24 relative"
          >
            <div className={`transition-transform duration-300 ${activeView === item.id ? 'text-brand-primary scale-110' : ''}`}>
              {item.icon}
            </div>
            <span className={`text-xs font-medium transition-colors duration-300 ${activeView === item.id ? 'text-white' : ''}`}>
              {item.label}
            </span>
            {activeView === item.id && (
              <motion.div
                layoutId="active-nav-indicator"
                className="absolute -top-px h-1 w-12 bg-brand-primary rounded-full"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
    </motion.nav>
  );
};

export default App;