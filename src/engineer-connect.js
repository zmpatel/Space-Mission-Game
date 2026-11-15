/*engineer-connect.js*/
let launchBusy = false;       
let resultReturnTo = 'engineer-page2';


// =====================================
// ROCKET ANIMATION
// =====================================
// mode 'fly'     → rocket lifts off and flies out of sight (success)
// mode 'explode' → rocket lifts off, then blows up part-way (Failed design or failed minigame)

const ROCKET_SVG = `
    <svg viewBox="0 0 60 120" width="60" height="120" aria-hidden="true">
        <path d="M30 0 C42 18 46 40 46 70 L14 70 C14 40 18 18 30 0Z" fill="#e8edf2"/>
        <path d="M30 0 C36 8 40 16 42 24 L18 24 C20 16 24 8 30 0Z" fill="#d9534f"/>
        <circle cx="30" cy="44" r="7" fill="#4aa3df" stroke="#334" stroke-width="2"/>
        <path d="M14 55 L0 86 L14 78Z" fill="#d9534f"/>
        <path d="M46 55 L60 86 L46 78Z" fill="#d9534f"/>
        <rect x="19" y="70" width="22" height="7" rx="2" fill="#556"/>
    </svg>
    <div class="rocket-flame"></div>`;

let rocketRun = 0;            

function clearRocket() {
    rocketRun++;
    const old = document.getElementById('rocket-layer');
    if (old) old.remove();
}

function explodeAt(layer, x, y) {
    const place = el => { el.style.left = x + 'px'; el.style.top = y + 'px'; layer.appendChild(el); };

    const flash = document.createElement('div');
    flash.className = 'boom-flash';
    place(flash);
    flash.animate([
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(3.2)', opacity: 0 }
    ], { duration: 600, easing: 'ease-out', fill: 'forwards' });

    const colors = ['#ffd23f', '#ff9f1c', '#ff5a36', '#d62828', '#8d99ae'];
    for (let i = 0; i < 30; i++) {
        const piece = document.createElement('div');
        piece.className = 'boom-piece';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        place(piece);

        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 160;
        piece.animate([
            { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(-50%, -50%) translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 50}px) scale(0.1)`, opacity: 0 }
        ], { duration: 700 + Math.random() * 600, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
    }
}

async function playRocket(mode) {
    clearRocket();
    const run = rocketRun;

    const layer = document.createElement('div');
    layer.id = 'rocket-layer';
    const rocket = document.createElement('div');
    rocket.className = 'rocket';
    rocket.innerHTML = ROCKET_SVG;
    layer.appendChild(rocket);
    document.getElementById('launch-result').appendChild(layer);

    const H = window.innerHeight;
    const exploding = mode === 'explode';
    const rise = exploding ? H * 0.55 : H + 250;

    const flight = rocket.animate([
        { transform: 'translate(-50%, 0) rotate(0deg)' },
        { transform: `translate(-50%, ${-rise}px) rotate(${exploding ? 7 : 0}deg)` }
    ], {
        duration: exploding ? 1400 : 1900,
        delay: 500,                       // lets the result screen fade in first
        easing: 'ease-in',
        fill: 'forwards'
    });

    try { await flight.finished; } catch (e) { return; }
    if (run !== rocketRun) return;        // player already left this screen

    if (exploding) {
        const box = rocket.getBoundingClientRect();
        rocket.remove();
        explodeAt(layer, box.left + box.width / 2, box.top + box.height / 2);
    }
}


// =====================================
// RESULT SCREEN
// =====================================
function showLaunchResult(title, text, buttonText, returnTo, rocketMode) {
    document.getElementById('launch-result-title').textContent = title;
    document.getElementById('launch-result-text').textContent = text;
    document.getElementById('launch-result-btn').textContent = buttonText;
    resultReturnTo = returnTo;
    showscreen('launch-result');
    playRocket(rocketMode);
}


// =====================================
// SUBMIT BUTTONS
// =====================================
function connectMinigames(submitId, missionNumber) {
    const button = document.getElementById(submitId);

    button.addEventListener('click', () => {
        if (launchBusy) return;

        const mission = missionState['mission' + missionNumber];
        const readiness = mission.getScore();

        // Bad design: failed screen, then the rocket lifts off and explodes.
        // Sliders are kept so the player can fix the design.
        if (readiness < LAUNCH_MIN) {
            showLaunchResult(
                '❌ Launch Failed',
                `Mission readiness was only ${readiness}% (you need ${LAUNCH_MIN}%). ${mission.getAdvice()}`,
                'Back to Design',
                'engineer-miss' + missionNumber,
                'explode'
            );
            return;
        }

        // Good design: play the minigames
        launchBusy = true;
        button.disabled = true;
        button.textContent = 'Launching...';

        setTimeout(() => {
            startEngineerMinigames(missionNumber, (success, reason) => {
                launchBusy = false;
                resetAllMissions();          // fresh sliders and Submit buttons for the next round
                showLaunchResult(
                    success ? 'Launch successful!' : 'Mission failed',
                    reason,
                    'Return to Missions',
                    'engineer-page2',
                    success ? 'fly' : 'explode'
                );
            });
        }, 800);
    });
}

connectMinigames('submit-sliders',   1);
connectMinigames('submit-sliders-2', 2);
connectMinigames('submit-sliders-3', 3);

document.getElementById('launch-result-btn').addEventListener('click', () => {
    clearRocket();
    showscreen(resultReturnTo);
});