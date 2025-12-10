import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import './Dashboard.css';

const STEPS = [
    {
        target: 'tour-welcome-header',
        title: "Welcome to Beacon Blocker",
        content: "Your AI Guardian is ready to help you focus. Let's take a quick tour!",
        position: 'center'
    },
    {
        target: 'tour-main-prompt',
        title: "Set Your Goal",
        content: "This is your Beacon. Tell the AI what you're working on (e.g., 'Study Biology') and it will block distractions.",
        position: 'bottom'
    },
    {
        target: 'tour-save-preset-btn',
        title: "Save As New Preset",
        content: "Create a new preset with your current settings. Once saved, a 'Save' button will appear to update that preset with any changes you make.",
        position: 'bottom'
    },
    {
        target: 'tour-load-preset-btn',
        title: "Load a Preset",
        content: "Switch between your saved presets instantly. Loading a preset restores all its settings.",
        position: 'bottom'
    },
    {
        target: 'tour-additional-controls',
        title: "Additional Controls",
        content: "This dropdown contains category blocks and allow/block lists. Click it to expand!",
        position: 'top',
        waitForClick: 'controls' // Wait for user to click this
    },
    {
        target: 'tour-additional-controls',
        title: "Inside: Categories & Lists",
        content: "Here you can block entire categories (Social Media, Games, etc.) and manage your whitelist/blacklist. These override AI decisions.",
        position: 'top',
        requireOpen: 'controls' // Requires controls to be open
    },
    {
        target: 'tour-recent-activity-container',
        title: "Recent Activity",
        content: "This shows what's been blocked or allowed. Click to expand!",
        position: 'top',
        waitForClick: 'activity'
    },
    {
        target: 'tour-recent-activity-container',
        title: "Inside: Activity Log",
        content: "Each entry shows a site that was blocked or allowed. Click on any log entry to see more details about why the decision was made.",
        position: 'top',
        requireOpen: 'activity'
    },
    {
        target: 'tour-view-history-btn',
        title: "View Full History",
        content: "Click this button to open your complete activity log.",
        position: 'top',
        requireOpen: 'activity'
    },
    {
        target: 'tour-full-history-modal',
        title: "Full History",
        content: "Browse, search, and clear your blocking history here. Close the modal when you're done.",
        position: 'center',
        action: 'openHistory'
    },
    {
        target: 'extension-icon-hint',
        title: "Pin the Extension",
        content: "Don't forget to pin Beacon Blocker in your browser toolbar. You're all set!",
        position: 'top-right'
    }
];

export default function OnboardingTour({ onClose, onOpenHistory, onCloseHistory, isHistoryModalOpen }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [spotlightStyle, setSpotlightStyle] = useState({});
    // Initialize with center position for step 0 (Welcome)
    const [tooltipStyle, setTooltipStyle] = useState({
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
    const resizeObserverRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    const highlightedRef = useRef(null); // Track highlighted element to restore styles

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenOnboarding');
        if (!hasSeenTour) {
            setIsVisible(true);

            // Close any open dropdowns when tour starts for clean state
            setTimeout(() => {
                // Close Additional Controls if open
                const controlsHeader = document.querySelector('.helpers-header');
                if (controlsHeader && controlsHeader.classList.contains('active')) {
                    controlsHeader.click();
                }
                // Close Recent Activity if open (check for expanded state)
                const activityHeader = document.querySelector('#tour-recent-activity');
                if (activityHeader) {
                    const container = document.getElementById('tour-recent-activity-container');
                    if (container) {
                        const content = container.querySelector('.log-feed-container');
                        if (content && content.offsetHeight > 0) {
                            activityHeader.click();
                        }
                    }
                }
            }, 100);
        }
    }, []);




    // --- ACTION & CLICK WATCHER EFFECT ---
    useEffect(() => {
        if (!isVisible) return;
        const step = STEPS[stepIndex];

        // --- OPEN LOGIC for steps that require sections to be open ---
        // Only open controls if this step EXPLICITLY requires it
        if (step.requireOpen === 'controls') {
            const controlsHeader = document.querySelector('.helpers-header');
            if (controlsHeader && !controlsHeader.classList.contains('active')) {
                controlsHeader.click();
            }
        }
        // Only open activity if this step EXPLICITLY requires it
        if (step.requireOpen === 'activity') {
            const activityContainer = document.getElementById('tour-recent-activity-container');
            const activityHeader = document.querySelector('#tour-recent-activity');
            // Check if closed by looking for collapsed class or height
            if (activityHeader && activityContainer) {
                const content = activityContainer.querySelector('.recent-activity-content, .log-feed-container');
                if (content && content.offsetHeight === 0) {
                    activityHeader.click();
                }
            }
        }
        if (step.action === 'openHistory') {
            if (onOpenHistory) onOpenHistory();
        }

        // --- CLOSE LOGIC for waitForClick steps (user should see closed state) ---
        if (step.waitForClick === 'controls') {
            const controlsHeader = document.querySelector('.helpers-header');
            if (controlsHeader && controlsHeader.classList.contains('active')) {
                controlsHeader.click();
            }
        }
        if (step.waitForClick === 'activity') {
            const activityHeader = document.querySelector('#tour-recent-activity');
            const container = document.getElementById('tour-recent-activity-container');
            if (activityHeader && container) {
                const content = container.querySelector('.log-feed-container');
                if (content && content.offsetHeight > 0) {
                    activityHeader.click();
                }
            }
        }

        // --- CLICK WATCHER: Auto-advance when user clicks the target ---
        if (step.waitForClick) {
            const handleClick = () => {
                // Small delay to let the animation happen
                setTimeout(() => {
                    if (stepIndex < STEPS.length - 1) {
                        setStepIndex(stepIndex + 1);
                    }
                }, 300);
            };

            let targetEl = null;
            if (step.waitForClick === 'controls') {
                targetEl = document.querySelector('.helpers-header');
            } else if (step.waitForClick === 'activity') {
                targetEl = document.querySelector('#tour-recent-activity');
            }

            if (targetEl) {
                targetEl.addEventListener('click', handleClick, { once: true });
                return () => targetEl.removeEventListener('click', handleClick);
            }
        }

        // --- CLEANUP: Only close history modal if not needed ---
        // Note: We don't auto-close dropdowns anymore to preserve state on back navigation
        if (step.action !== 'openHistory' && isHistoryModalOpen && onCloseHistory) {
            onCloseHistory();
        }

    }, [stepIndex, isVisible, onOpenHistory, onCloseHistory]);

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

        // If we are on "View Full History" step (index 8) and the modal opens,
        // automatically advance to "Full History Modal" (index 9).
        if (stepIndex === 8 && modalJustOpened) {
            setStepIndex(9);
        }

        // Check if modal JUST closed (true -> false)
        const modalJustClosed = !isHistoryModalOpen && prevIsHistoryModalOpen.current;

        // If we are on "Full History Modal" step (index 9) and the modal closes,
        // automatically advance to "Pin Extension" step (index 10).
        if (stepIndex === 9 && modalJustClosed) {
            setStepIndex(10);
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

        // Tooltip position logic - STATIONARY in top-right corner
        // We scroll the page to bring the target element into view instead
        const tooltipWidth = 350;
        const tooltipHeight = 220; // Approximate height of tooltip

        if (step.position === 'center') {
            // Centered for welcome step only
            setTooltipStyle({
                position: 'fixed',
                top: '35%',
                left: '50%',
                transform: 'translateX(-50%)',
                right: 'auto',
                width: `${tooltipWidth}px`,
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });
        } else {
            // Fixed BOTTOM-RIGHT for all other steps - leaves top of page clear for highlighted elements
            setTooltipStyle({
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                top: 'auto',
                left: 'auto',
                transform: 'none',
                width: `${tooltipWidth}px`,
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });

            // Scroll so highlighted element is visible (centered in viewport above tooltip)
            if (targetEl) {
                targetEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
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
            const currentStep = STEPS[stepIndex];

            // If current step is waitForClick, open the dropdown when pressing Next
            if (currentStep.waitForClick === 'controls') {
                const controlsHeader = document.querySelector('.helpers-header');
                if (controlsHeader && !controlsHeader.classList.contains('active')) {
                    controlsHeader.click();
                }
            } else if (currentStep.waitForClick === 'activity') {
                const activityHeader = document.querySelector('#tour-recent-activity');
                if (activityHeader) {
                    activityHeader.click();
                }
            }

            setStepIndex(stepIndex + 1);
        } else {
            handleDismiss();
        }
    };

    const handleBack = () => {
        if (stepIndex > 0) {
            const prevStep = STEPS[stepIndex - 1];

            // If going back to a waitForClick step, close the dropdown
            if (prevStep.waitForClick === 'controls') {
                const controlsHeader = document.querySelector('.helpers-header');
                if (controlsHeader && controlsHeader.classList.contains('active')) {
                    controlsHeader.click();
                }
            } else if (prevStep.waitForClick === 'activity') {
                const activityHeader = document.querySelector('#tour-recent-activity');
                const container = document.getElementById('tour-recent-activity-container');
                if (activityHeader && container) {
                    const content = container.querySelector('.log-feed-container');
                    if (content && content.offsetHeight > 0) {
                        activityHeader.click();
                    }
                }
            }

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
