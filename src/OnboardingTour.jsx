import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import './Dashboard.css';

const STEPS = [
    {
        target: 'tour-welcome-header',
        title: "Welcome to Beacon Blocker",
        content: "Let's go over how your beacon will help you stay the course.\n\n(Continue with the arrow keys or by clicking the \"Next\" button.)",
        position: 'center',
        noSpotlight: true // Center welcome step, no spotlight needed
    },
    {
        target: 'tour-main-prompt',
        title: "Set Your Heading",
        content: "This is your main tool for instructing your Beacon. Tell Beacon Blocker what you're up to so it can help you keep your heading. Try typing something now!",
        position: 'bottom',
        highlightLogo: true // Also highlight logo during this step
    },
    {
        target: 'tour-auto-sync',
        title: "Auto Sync",
        content: "Did you notice anything when you typed? Beacon Blocker automatically saves and syncs changes.",
        position: 'bottom'
    },
    {
        target: 'tour-presets-section',
        title: "Presets",
        content: "These buttons allow you to save your instructions for different types of browsing e.g. Work/School/Personal.",
        position: 'bottom'
    },
    {
        target: 'tour-update-preset-btn',
        title: "Save To Button",
        content: "The Save To button displays your current preset. Click on it to update the name of your current preset. When you make changes to your instructions this button will turn green, inviting you to save those changes. Hit the \"X\" button to remove your current preset and reset the dashboard.",
        position: 'bottom'
    },
    {
        target: 'tour-save-preset-btn',
        title: "Save As Button",
        content: "The Save As button creates a new preset.",
        position: 'bottom'
    },
    {
        target: 'tour-load-preset-btn',
        title: "Load Button",
        content: "The Load button allows you to access presets that have been previously saved. Click it to see your saved presets!",
        position: 'bottom',
        waitForClick: 'loadPreset'
    },
    {
        target: 'tour-load-modal',
        title: "Manage Presets",
        content: "Load, rename and delete presets here!",
        position: 'center',
        requireOpen: 'loadModal',
        hidden: true // Only shown when user clicks load button
    },
    {
        target: 'tour-additional-controls',
        title: "Additional Controls",
        content: "This dropdown contains category blocks and the allow/block lists. Click on it to see what's inside.",
        position: 'top',
        waitForClick: 'controls'
    },
    {
        target: 'tour-categories',
        title: "Quick Block Categories",
        content: "Categories are broad — they will instruct the AI to notice anything related and block it. For example, if 'Gaming' is selected, gaming-related content on YouTube will be blocked.",
        position: 'top',
        requireOpen: 'controls'
    },
    {
        target: 'tour-lists',
        title: "Allow & Block Lists",
        content: "The 'Always Allow' (white) list will allow sites regardless of other rules. The 'Always Block' (black) list does the opposite. These lists override all other rules.",
        position: 'top',
        requireOpen: 'controls'
    },
    {
        target: 'tour-recent-activity',
        title: "Recent Activity",
        content: "This shows the blocking decisions your Beacon has recently made. Click to expand it.",
        position: 'top',
        waitForClick: 'activity'
    },
    {
        target: 'tour-recent-activity-container',
        title: "Inside: Activity Log",
        content: "Click on any entry to see more details about why each page was blocked. If you disagree with a block, please report it and tell us why!",
        position: 'top',
        requireOpen: 'activity'
    },
    {
        target: 'tour-view-history-btn',
        title: "View Full History",
        content: "Click this button to see your complete activity log.",
        position: 'top',
        requireOpen: 'activity',
        waitForClick: 'viewHistory'
    },
    {
        target: 'tour-full-history-modal',
        title: "Full History",
        content: "Browse, search, and clear entries here.",
        position: 'center',
        action: 'openHistory'
    },
    {
        target: 'extension-icon-hint',
        title: "Pin the Extension",
        content: "Don't forget to pin Beacon Blocker in your browser toolbar! Once you've done this, you can click on your Beacon anytime to quickly sign out, clear your cache, or open the dashboard.",
        position: 'top-right',
        arrowUp: true
    }
];

export default function OnboardingTour({ onClose, onOpenHistory, onCloseHistory, isHistoryModalOpen }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [spotlightStyle, setSpotlightStyle] = useState({});
    const [secondSpotlightStyle, setSecondSpotlightStyle] = useState({ display: 'none' }); // For logo highlight
    // Initialize with center position for step 0 (Welcome) - must match center position exactly
    const [tooltipStyle, setTooltipStyle] = useState({
        position: 'fixed',
        top: '35%',
        left: '50%',
        transform: 'translateX(-50%)',
        right: 'auto',
        bottom: 'auto',
        width: '350px',
        zIndex: 10001,
        visibility: 'visible',
        opacity: 1
    });
    const resizeObserverRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    const highlightedRef = useRef(null); // Track highlighted element to restore styles
    const prevStepBeforeHiddenRef = useRef(null); // Track step before entering hidden step

    // Helper to find next non-hidden step
    const goToNextStep = () => {
        // If leaving hidden Load Modal step, close the modal first
        const currentStep = STEPS[stepIndex];
        if (currentStep && currentStep.hidden && currentStep.requireOpen === 'loadModal') {
            const modalCloseBtn = document.querySelector('#tour-load-modal .modal-close-button');
            if (modalCloseBtn) {
                modalCloseBtn.click();
            }
        }

        let next = stepIndex + 1;
        while (next < STEPS.length && STEPS[next].hidden) {
            next++;
        }
        if (next < STEPS.length) {
            setStepIndex(next);
        } else {
            // Finish tour
            setIsVisible(false);
            localStorage.setItem('hasSeenOnboarding', 'true');
            if (onClose) onClose();
            if (onCloseHistory) onCloseHistory();
        }
    };

    // Helper to find previous non-hidden step
    const goToPrevStep = () => {
        let prev = stepIndex - 1;
        while (prev >= 0 && STEPS[prev].hidden) {
            prev--;
        }
        if (prev >= 0) {
            setStepIndex(prev);
        }
    };

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
            // Close controls first to make room
            const controlsHeader = document.querySelector('.helpers-header:not(.recent-activity-section)');
            if (controlsHeader && controlsHeader.classList.contains('active')) {
                controlsHeader.click();
            }

            // Small delay to let controls close, then open activity
            setTimeout(() => {
                const activityHeader = document.querySelector('#tour-recent-activity');
                if (activityHeader) {
                    // Check if activity is open by looking for .active class on the header
                    const isOpen = activityHeader.classList.contains('active');
                    if (!isOpen) {
                        activityHeader.click();
                    }
                }
            }, 150);
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
                        // Check if next step is hidden (like Load Modal)
                        const nextStep = STEPS[stepIndex + 1];
                        if (nextStep && nextStep.hidden) {
                            // Save current step so we can return to it
                            prevStepBeforeHiddenRef.current = stepIndex;
                        }
                        setStepIndex(stepIndex + 1);
                    }
                }, 300);
            };

            let targetEl = null;
            if (step.waitForClick === 'controls') {
                targetEl = document.querySelector('.helpers-header');
            } else if (step.waitForClick === 'activity') {
                targetEl = document.querySelector('#tour-recent-activity');
            } else if (step.waitForClick === 'viewHistory') {
                targetEl = document.getElementById('tour-view-history-btn');
            } else if (step.waitForClick === 'loadPreset') {
                targetEl = document.getElementById('tour-load-preset-btn');
            }

            if (targetEl) {
                targetEl.addEventListener('click', handleClick, { once: true });
                return () => targetEl.removeEventListener('click', handleClick);
            }
        }

        // --- MODAL CLOSE WATCHER: Auto-advance when Load Modal closes ---
        if (step.hidden && step.requireOpen === 'loadModal') {
            const checkModalClosed = () => {
                const modal = document.getElementById('tour-load-modal');
                if (!modal) {
                    // Modal closed, advance to next step
                    goToNextStep();
                }
            };

            // Use MutationObserver to watch for modal removal
            const observer = new MutationObserver(() => {
                checkModalClosed();
            });

            observer.observe(document.body, { childList: true, subtree: true });

            return () => observer.disconnect();
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
                goToNextStep();
            }
            if (e.key === 'ArrowLeft') {
                goToPrevStep();
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

        // If we are on "View Full History" step (index 13) and the modal opens,
        // automatically advance to "Full History Modal" (index 14).
        if (stepIndex === 13 && modalJustOpened) {
            setStepIndex(14);
        }

        // Check if modal JUST closed (true -> false)
        const modalJustClosed = !isHistoryModalOpen && prevIsHistoryModalOpen.current;

        // If we are on "Full History Modal" step (index 14) and the modal closes,
        // automatically advance to "Pin Extension" step (index 15).
        if (stepIndex === 14 && modalJustClosed) {
            setStepIndex(15);
        }

        // Update ref
        prevIsHistoryModalOpen.current = isHistoryModalOpen;
    }, [isHistoryModalOpen, stepIndex, isVisible]);


    // --- POSITIONING LOGIC ---
    const updatePosition = () => {
        const step = STEPS[stepIndex];

        const targetEl = document.getElementById(step.target);

        // Handle spotlight visibility based on step type
        if (step.position === 'center' || step.position === 'top-right') {
            // No spotlight for center (welcome) or top-right (pin extension) steps
            setSpotlightStyle({ display: 'none' });
        } else if (targetEl) {
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

            // Also highlight logo if step requires it
            if (step.highlightLogo) {
                const logoEl = document.getElementById('tour-auto-sync');
                if (logoEl) {
                    logoEl.style.zIndex = '10002';
                    logoEl.style.position = 'relative';
                }
            }

            // Setup ResizeObserver if target changes
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
            resizeObserverRef.current = new ResizeObserver(() => {
                const newRect = targetEl.getBoundingClientRect();

                // Main spotlight on target element only
                setSpotlightStyle({
                    display: 'block',
                    position: 'fixed',
                    top: newRect.top - 10,
                    left: newRect.left - 10,
                    width: newRect.width + 20,
                    height: newRect.height + 20,
                    borderRadius: '8px',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
                    zIndex: 10000,
                    pointerEvents: 'none',
                    transition: 'all 0.2s ease'
                });

                // Update second spotlight for logo if needed
                if (step.highlightLogo) {
                    const logoEl = document.getElementById('tour-auto-sync');
                    if (logoEl) {
                        const logoRect = logoEl.getBoundingClientRect();
                        setSecondSpotlightStyle({
                            display: 'block',
                            position: 'fixed',
                            top: logoRect.top - 8,
                            left: logoRect.left - 8,
                            width: logoRect.width + 16,
                            height: logoRect.height + 16,
                            borderRadius: '8px',
                            border: '3px solid #3b82f6',
                            boxShadow: '0 0 20px 5px rgba(59, 130, 246, 0.6)',
                            zIndex: 10003,
                            pointerEvents: 'none',
                            transition: 'all 0.2s ease',
                            background: 'transparent'
                        });
                    }
                }
            });
            resizeObserverRef.current.observe(targetEl);

            const rect = targetEl.getBoundingClientRect();

            // Main spotlight on target element only
            const spotlightRect = {
                top: rect.top - 10,
                left: rect.left - 10,
                width: rect.width + 20,
                height: rect.height + 20
            };

            // Set main spotlight
            setSpotlightStyle({
                display: 'block',
                position: 'fixed',
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
                zIndex: 10000,
                pointerEvents: 'none',
                transition: 'all 0.2s ease'
            });

            // If highlightLogo, add second spotlight for logo (with glowing border instead of cutout)
            if (step.highlightLogo) {
                const logoEl = document.getElementById('tour-auto-sync');
                if (logoEl) {
                    const logoRect = logoEl.getBoundingClientRect();
                    setSecondSpotlightStyle({
                        display: 'block',
                        position: 'fixed',
                        top: logoRect.top - 8,
                        left: logoRect.left - 8,
                        width: logoRect.width + 16,
                        height: logoRect.height + 16,
                        borderRadius: '8px',
                        border: '3px solid #3b82f6',
                        boxShadow: '0 0 20px 5px rgba(59, 130, 246, 0.6)',
                        zIndex: 10003,
                        pointerEvents: 'none',
                        transition: 'all 0.2s ease',
                        background: 'transparent'
                    });
                }
            } else {
                setSecondSpotlightStyle({ display: 'none' });
            }
        }

        // Tooltip position logic - STATIONARY in top-right corner
        // We scroll the page to bring the target element into view instead
        const tooltipWidth = 350;
        const tooltipHeight = 220; // Approximate height of tooltip

        if (step.position === 'center') {
            // Centered for welcome step only - hide spotlight too
            setSpotlightStyle({ display: 'none' });
            setTooltipStyle({
                position: 'fixed',
                top: '35%',
                left: '50%',
                transform: 'translateX(-50%)',
                right: 'auto',
                bottom: 'auto',
                width: `${tooltipWidth}px`,
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });
        } else if (step.position === 'top-right') {
            // Top-right corner for Pin Extension step with upward arrow
            // Arrow points to where extensions typically are (~3 inches / 150px from right edge)
            setSpotlightStyle({ display: 'none' });
            setTooltipStyle({
                position: 'fixed',
                top: '80px',
                right: '150px', // More toward center where extension icons typically are
                bottom: 'auto',
                left: 'auto',
                transform: 'none',
                width: `${tooltipWidth}px`,
                zIndex: 10001,
                visibility: 'visible',
                opacity: 1
            });
        } else {
            // Fixed BOTTOM-RIGHT for all other steps - leaves top of page clear for highlighted elements
            // Explicitly show spotlight for these steps
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

        // If leaving hidden Load Modal step, close the modal
        if (currentStep.hidden && currentStep.requireOpen === 'loadModal') {
            const modalCloseBtn = document.querySelector('#tour-load-modal .modal-close-button');
            if (modalCloseBtn) {
                modalCloseBtn.click();
            }
        }

        goToNextStep();
    };

    const handleBack = () => {
        // If on a hidden step, return to the step before we entered it
        if (STEPS[stepIndex].hidden && prevStepBeforeHiddenRef.current !== null) {
            setStepIndex(prevStepBeforeHiddenRef.current);
            prevStepBeforeHiddenRef.current = null;
            return;
        }

        const prevIdx = stepIndex - 1;
        if (prevIdx >= 0) {
            const prevStep = STEPS[prevIdx];

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
        }

        goToPrevStep();
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
            {/* Main Spotlight Overlay */}
            <div className="tour-spotlight" style={spotlightStyle}></div>

            {/* Second Spotlight for Logo (glowing highlight) */}
            <div className="tour-spotlight-secondary" style={secondSpotlightStyle}></div>

            {/* Tooltip Card */}
            <div
                className={`tour-card ${currentStep.position === 'top-right' ? 'arrow-top-right' : ''}`}
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
                        {STEPS.map((step, i) => (
                            // Only show dots for non-hidden steps
                            !step.hidden && (
                                <span
                                    key={i}
                                    className={`tour-dot ${i === stepIndex ? 'active' : ''}`}
                                    onClick={() => setStepIndex(i)}
                                    style={{ cursor: 'pointer' }}
                                ></span>
                            )
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
