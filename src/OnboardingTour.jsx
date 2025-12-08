import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import './Dashboard.css';

const STEPS = [
    {
        target: 'tour-welcome-header',
        title: "Welcome to Beacon Blocker",
        content: "Your new AI Guardian is ready to help you focus. Let's take a quick tour of the features.",
        position: 'center'
    },
    {
        target: 'tour-main-prompt',
        title: "Set Your Goal",
        content: "This is your Beacon. Tell the AI exactly what you want to do (e.g., 'Study Biology'). It uses this to decide what to block.",
        position: 'bottom'
    },
    {
        target: 'tour-save-preset-btn',
        title: "Save & Load Presets",
        content: "Save your current setup as a preset (e.g., 'Work Mode') and load it anytime to instantly switch contexts.",
        position: 'bottom'
    },
    {
        target: 'tour-additional-controls',
        title: "Additional Controls",
        content: "Need more control? Open this section to fine-tune your settings.",
        position: 'top',
        action: 'openControls'
    },
    {
        target: 'tour-categories',
        title: "Quick Block Categories",
        content: "Explicitly block entire categories like Social Media, Games, or News with a single click.",
        position: 'top',
        action: 'openControls'
    },
    {
        target: 'tour-lists',
        title: "Always Allow / Block",
        content: "Add specific websites to your Whitelist (always allow) or Blacklist (always block).",
        position: 'top',
        action: 'openControls'
    },
    {
        target: 'tour-recent-activity-container',
        title: "Recent Activity",
        content: "Check here to see what sites have been blocked or allowed recently.",
        position: 'top',
        action: 'openActivity'
    },
    {
        target: 'tour-recent-activity-item-0',
        title: "Log Details",
        content: "Click on any entry to see details. If no activity is shown, browse the web to generate logs.",
        position: 'top',
        action: 'openActivity'
    },
    {
        target: 'tour-view-history-btn',
        title: "Full History",
        content: "Click this button to see your complete activity log.",
        position: 'top',
        action: 'openActivity'
    },
    {
        target: 'tour-full-history-modal',
        title: "Full History View",
        content: "Here you can browse your complete activity log, search for specific sites, and clear your history if needed.",
        position: 'top',
        action: 'openHistory'
    },
    {
        target: 'extension-icon-hint',
        title: "Pin the Extension",
        content: "Don't forget to pin the Beacon Blocker extension in your browser toolbar! You'll need it to see block pages and status.",
        position: 'top-right'
    }
];

export default function OnboardingTour({ onClose, onOpenHistory, onCloseHistory, isHistoryModalOpen }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [spotlightStyle, setSpotlightStyle] = useState({});
    const [tooltipStyle, setTooltipStyle] = useState({});
    const resizeObserverRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    const highlightedRef = useRef(null); // Track highlighted element to restore styles

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenOnboarding');
        if (!hasSeenTour) {
            setIsVisible(true);
        }
    }, []);



    // --- ACTION & CLEANUP EFFECT ---
    useEffect(() => {
        if (!isVisible) return;
        const step = STEPS[stepIndex];

        // Clear previous styles immediately to prevent ghosting
        setSpotlightStyle({});
        setTooltipStyle({});

        // --- OPEN LOGIC ---
        if (step.action === 'openControls') {
            const controlsHeader = document.querySelector('.helpers-header');
            if (controlsHeader && !controlsHeader.classList.contains('active')) {
                controlsHeader.click();
            }
        } else if (step.action === 'openActivity') {
            const activityHeader = document.querySelector('#tour-recent-activity');
            if (activityHeader && activityHeader.style.marginBottom === '0px') {
                activityHeader.click();
            }
        } else if (step.action === 'openHistory') {
            if (onOpenHistory) onOpenHistory();
        }

        // --- CLEANUP LOGIC (Close things if not needed for this step) ---
        // 1. Controls
        if (step.action !== 'openControls') {
            const controlsHeader = document.querySelector('.helpers-header');
            if (controlsHeader && controlsHeader.classList.contains('active')) {
                controlsHeader.click();
            }
        }
        // 2. Activity
        if (step.action !== 'openActivity') {
            const activityHeader = document.querySelector('#tour-recent-activity');
            if (activityHeader && activityHeader.style.marginBottom !== '0px') {
                activityHeader.click();
            }
        }
        // 3. History Modal
        if (step.action !== 'openHistory') {
            // Only close if it's open. 
            // Note: We exclude isHistoryModalOpen from deps to avoid race conditions with auto-advance.
            if (isHistoryModalOpen && onCloseHistory) {
                onCloseHistory();
            }
        }

    }, [stepIndex, isVisible, onOpenHistory, onCloseHistory]); // Removed isHistoryModalOpen to prevent race with auto-advance

    // --- KEYBOARD NAVIGATION ---
    useEffect(() => {
        if (!isVisible) return;
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') {
                if (stepIndex < STEPS.length - 1) {
                    setStepIndex(prev => prev + 1);
                } else {
                    // Finish
                    setIsVisible(false);
                    localStorage.setItem('hasSeenOnboarding', 'true');
                    if (onClose) onClose();
                    if (onCloseHistory) onCloseHistory();
                }
            }
            if (e.key === 'ArrowLeft') {
                if (stepIndex > 0) {
                    setStepIndex(prev => prev - 1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, stepIndex, onClose, onCloseHistory]);

    // --- AUTO-ADVANCE EFFECT: Watch for History Modal Open ---
    const prevIsHistoryModalOpen = useRef(isHistoryModalOpen);

    useEffect(() => {
        if (!isVisible) return;
        const step = STEPS[stepIndex];

        // Check if modal JUST opened (false -> true)
        const modalJustOpened = isHistoryModalOpen && !prevIsHistoryModalOpen.current;

        // If we are on "Full History" (index 7) and the modal opens,
        // automatically advance to "Full History View" (index 8) inside the modal.
        if (stepIndex === 7 && modalJustOpened) {
            setStepIndex(8);
        }

        // Update ref
        prevIsHistoryModalOpen.current = isHistoryModalOpen;
    }, [isHistoryModalOpen, stepIndex, isVisible]);


    // --- POSITIONING LOGIC ---
    const updatePosition = () => {
        const step = STEPS[stepIndex];

        // The 'top-right' position is now handled by the uniform fixed position below,
        // but we still need to ensure the spotlight is hidden for it.
        if (step.position === 'top-right') {
            setSpotlightStyle({ display: 'none' });
        }

        const targetEl = document.getElementById(step.target);

        if (targetEl) {
            // --- DYNAMIC HIGHLIGHT (Z-Index Boost) ---
            if (highlightedRef.current?.el !== targetEl) {
                // 1. Restore previous
                if (highlightedRef.current?.el) {
                    highlightedRef.current.el.style.zIndex = highlightedRef.current.originalZIndex;
                    highlightedRef.current.el.style.position = highlightedRef.current.originalPosition;
                }

                // 2. Apply new
                const originalZIndex = targetEl.style.zIndex;
                const originalPosition = targetEl.style.position;

                // Ensure position is at least relative so z-index works
                const computedStyle = window.getComputedStyle(targetEl);
                if (computedStyle.position === 'static') {
                    targetEl.style.position = 'relative';
                }

                targetEl.style.zIndex = '10002'; // Above spotlight (10000) and tooltip (10001)

                // 3. Track
                highlightedRef.current = { el: targetEl, originalZIndex, originalPosition };
            }

            // Setup ResizeObserver if target changes
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
            resizeObserverRef.current = new ResizeObserver(() => {
                const newRect = targetEl.getBoundingClientRect();
                setSpotlightStyle(prev => ({
                    ...prev,
                    top: newRect.top - 10,
                    left: newRect.left - 10,
                    width: newRect.width + 20,
                    height: newRect.height + 20
                }));
            });
            resizeObserverRef.current.observe(targetEl);

            const rect = targetEl.getBoundingClientRect();

            // Spotlight (hole)
            setSpotlightStyle(prev => ({
                ...prev, // Preserve display: 'none' if set by 'top-right'
                position: 'fixed',
                top: rect.top - 10,
                left: rect.left - 10,
                width: rect.width + 20,
                height: rect.height + 20,
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
                zIndex: 10000,
                pointerEvents: 'none',
                transition: 'all 0.2s ease'
            }));
        }

        // Tooltip position logic
        // Steps 0 & 1 (Welcome & Goal): Centered below prompt box
        // Steps 2+: Fixed Top-Right

        if (stepIndex <= 1) {
            setTooltipStyle({
                position: 'fixed',
                top: '35%',
                left: '50%',
                transform: 'translateX(-50%)',
                right: 'auto',
                width: '350px',
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });
        } else {
            setTooltipStyle({
                position: 'fixed',
                top: '20px',
                right: '20px',
                left: 'auto',
                transform: 'none',
                width: '350px',
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });
        }

        // Retry logic for spotlight target (even if card is fixed, we need spotlight)
        if (step.target) {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            // Only retry if target is missing
            if (!document.getElementById(step.target)) {
                retryTimeoutRef.current = setTimeout(updatePosition, 100);
            }
        }
    };

    // --- POSITION EFFECT: Runs on stepIndex, resize, scroll ---
    useLayoutEffect(() => {
        if (isVisible) {
            // Immediate update attempt before paint
            updatePosition();
        }
    }, [stepIndex, isVisible]);

    useEffect(() => {
        if (isVisible) {
            // Delayed update for animations/renders
            const timer = setTimeout(updatePosition, 100);
            const timer2 = setTimeout(updatePosition, 300);

            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);

            return () => {
                clearTimeout(timer);
                clearTimeout(timer2);
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
                if (resizeObserverRef.current) {
                    resizeObserverRef.current.disconnect();
                }
                // Restore styles on unmount/close
                if (highlightedRef.current?.el) {
                    highlightedRef.current.el.style.zIndex = highlightedRef.current.originalZIndex;
                    highlightedRef.current.el.style.position = highlightedRef.current.originalPosition;
                }
            };
        }
    }, [stepIndex, isVisible]);

    const handleNext = () => {
        if (stepIndex < STEPS.length - 1) {
            setStepIndex(stepIndex + 1);
        } else {
            handleDismiss();
        }
    };

    const handleBack = () => {
        if (stepIndex > 0) {
            setStepIndex(stepIndex - 1);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('hasSeenOnboarding', 'true');
        if (onClose) onClose();
        if (onCloseHistory) onCloseHistory();
    };

    if (!isVisible || stepIndex >= STEPS.length) return null;

    const currentStep = { ...STEPS[stepIndex] }; // Clone to allow modification

    // Dynamic content for Log Details step if fallback is active
    if (currentStep.target === 'tour-recent-activity-item-0') {
        const itemTarget = document.getElementById('tour-recent-activity-item-0');
        if (!itemTarget) {
            currentStep.content = "This section shows your recent activity. When you have entries, click them for details.";
        }
    }

    const isLastStep = stepIndex === STEPS.length - 1;

    // Use Portal to render outside of parent container to avoid stacking/overflow issues
    return ReactDOM.createPortal(
        <div className="onboarding-tour-portal">
            {/* Spotlight Overlay */}
            <div className="tour-spotlight" style={spotlightStyle}></div>



            {/* Tooltip Card */}
            <div
                className="tour-card"
                style={{
                    ...tooltipStyle,
                    visibility: Object.keys(tooltipStyle).length === 0 ? 'hidden' : 'visible',
                    opacity: Object.keys(tooltipStyle).length === 0 ? 0 : 1
                }}
            >
                <div className="tour-header">
                    <h3>{currentStep.title}</h3>
                    <button className="tour-close" onClick={handleDismiss}>&times;</button>
                </div>
                <div className="tour-body">
                    <p>{currentStep.content}</p>
                </div>
                <div className="tour-footer">
                    <div className="tour-dots">
                        {STEPS.map((_, i) => (
                            <span
                                key={i}
                                className={`tour-dot ${i === stepIndex ? 'active' : ''}`}
                                onClick={() => setStepIndex(i)}
                                style={{ cursor: 'pointer' }}
                            ></span>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            className="tour-btn secondary"
                            onClick={handleBack}
                            disabled={stepIndex === 0}
                            style={{ opacity: stepIndex === 0 ? 0.5 : 1, cursor: stepIndex === 0 ? 'default' : 'pointer' }}
                        >
                            Back
                        </button>
                        <button className="tour-btn" onClick={handleNext}>
                            {isLastStep ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
