/*script.js*/
// =====================================
// TUNING KNOBS
// =====================================
const LAUNCH_MIN = 70;        // readiness % needed to attempt a launch
const PUSH = 0.6;             // how strongly moving a slider drags the sliders that depend on it (0 = none, 1 = full)
const DEAD_ZONE = 0.03;       // error (fraction of slider range) that costs nothing
const STRICTNESS = 300;       // points lost per 1.0 of error beyond the dead zone
const ON_TARGET = 0.05;       // error below this shows the green "on target" hint
const SHOW_HINTS = true;      // set false for a harder game (no per-slider hints)


// =====================================
// SCREEN NAVIGATION (with back button)
// =====================================
// Flow: title-screen → role-screen → engineer-page2 → engineer-miss1/2/3 → launch-result


let currentScreen = 'title-screen';
const screenHistory = [];
const backBtn = document.getElementById('back-btn');

function showscreen(id) {
    if (id !== currentScreen) {
        const seen = screenHistory.lastIndexOf(id);
        if (seen !== -1) screenHistory.length = seen;       // unwind to that screen
        else screenHistory.push(currentScreen);             // normal forward step
    }

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    currentScreen = id;

    backBtn.classList.toggle('hidden', screenHistory.length === 0);
    window.scrollTo(0, 0);
}

function goBack() {
    if (screenHistory.length === 0) return;
    if (typeof launchBusy !== 'undefined' && launchBusy) return;     // no escaping mid-launch
    if (typeof clearRocket === 'function') clearRocket();            // stop any rocket animation
    showscreen(screenHistory[screenHistory.length - 1]);
}

backBtn.addEventListener('click', goBack);
backBtn.classList.add('hidden');

document.getElementById('play-btn').addEventListener('click', () => showscreen('role-screen'));
document.getElementById('restart-btn').addEventListener('click', () => showscreen('title-screen'));
document.getElementById('role-engineer').addEventListener('click', () => showscreen('engineer-page2'));
document.getElementById('mission1').addEventListener('click', () => showscreen('engineer-miss1'));
document.getElementById('mission2').addEventListener('click', () => showscreen('engineer-miss2'));
document.getElementById('mission3').addEventListener('click', () => showscreen('engineer-miss3'));


// =====================================
// MISSION SETTINGS
// =====================================


const missionConfigs = {
    mission1: {
        sliders: ["slider1", "slider2", "slider3", "slider4"],   // altitude, duration, payload, thrust
        costId: "slider5",
        ranges:  [[205, 215], [5, 20], [200, 1100], [9000, 135000]],
        targets: [208, 15, 450, 78000],
        weights: [0.25, 0.20, 0.25, 0.30],
        deps: [
            {},
            {},
            { 0: -0.5, 1: 0.4 },    // payload: higher orbit → lighter; longer mission → more instruments/power
            { 0: 0.4, 2: 0.7 }      // thrust: higher + heavier → more thrust
        ],
        hints: [
            ["Altitude too low for good data", "Altitude too high, so extra fuel is burned"],
            ["Not enough time to collect data", "Longer than the payload can power"],
            ["Payload too light for this mission", "Payload too heavy for this altitude and duration"],
            ["Not enough thrust to lift this payload", "Too much thrust, so fuel and money are wasted"]
        ]
    },

    mission2: {
        sliders: ["slider7", "slider8", "slider9"],              // altitude, payload, thrust
        costId: "slider11",
        ranges:  [[22000, 22500], [6000, 17000], [1700000, 5500000]],
        targets: [22400, 9000, 4400000],
        weights: [0.30, 0.30, 0.40],
        deps: [
            {},
            { 0: -0.4 },
            { 0: 0.3, 1: 0.7 }
        ],
        hints: [
            ["Too low to hold a geostationary orbit", "Too high, beyond the geostationary ring"],
            ["Not enough instruments for hi-res imaging", "Too heavy for this orbit height"],
            ["Not enough thrust to reach orbit with this payload", "Too much thrust, so fuel and money are wasted"]
        ]
    },

    mission3: {
        sliders: ["slider13", "slider14", "slider15"],           // distance, payload, thrust
        costId: "slider17",
        ranges:  [[200000000, 400000000], [11000, 17000], [15000000, 25000000]],
        targets: [340000000, 12500, 22000000],
        weights: [0.30, 0.25, 0.45],
        deps: [
            {},
            { 0: -0.4 },
            { 0: 0.3, 1: 0.7 }
        ],
        hints: [
            ["Distance too short to reach Europa", "Too far, so too little sunlight for power"],
            ["Not enough science instruments", "Too heavy for a trip this far"],
            ["Not enough thrust for this trajectory and payload", "Too much thrust, so fuel and money are wasted"]
        ]
    }
};

// Other scripts (engineer-connect.js)
const missionState = {};


// =====================================
// HELPERS
// =====================================
const norm = (value, [min, max]) => (value - min) / (max - min);
const clamp01 = x => Math.min(1, Math.max(0, x));

// Slider positioning 
function idealN(config, i, n) {
    let ideal = norm(config.targets[i], config.ranges[i]);
    const deps = config.deps[i];
    for (const k in deps) {
        ideal += deps[k] * (n[k] - norm(config.targets[k], config.ranges[k]));
    }
    return clamp01(ideal);
}


// =====================================
// SET UP EACH MISSION
// =====================================
function setupMissionSliders(missionName) {
    const config = missionConfigs[missionName];

    const sliders = config.sliders.map(id => document.getElementById(id));
    const cost = document.getElementById(config.costId);
    const submitButton = document.getElementById(
        { mission1: "submit-sliders", mission2: "submit-sliders-2", mission3: "submit-sliders-3" }[missionName]
    );
    const container = document.getElementById(missionName + "-container");

    const defaults = sliders.map(s => s.value);
    const submitText = submitButton.textContent;
    cost.disabled = true;

    // live value + hint under every slider
    const displays = [];
    const hintEls = [];
    sliders.forEach(slider => {
        const label = document.querySelector(`label[for="${slider.id}"]`);
        const display = document.createElement("span");
        display.className = "slider-value";
        label.appendChild(display);
        displays.push(display);

        const hint = document.createElement("div");
        hint.className = "slider-hint";
        slider.insertAdjacentElement("afterend", hint);
        hintEls.push(hint);
    });

    const costLabel = document.querySelector(`label[for="${cost.id}"]`);
    const costDisplay = document.createElement("span");
    costDisplay.className = "slider-value";
    costLabel.appendChild(costDisplay);

    // score panel
    const scorePanel = document.createElement("div");
    scorePanel.className = "score-panel";
    scorePanel.innerHTML = `
        <h3>MISSION READINESS</h3>
        <div class="score-number">0%</div>
        <div class="score-bar">
            <div class="score-fill"></div>
            <div class="score-threshold" style="left:${LAUNCH_MIN}%" title="Launch needs ${LAUNCH_MIN}%"></div>
        </div>
        <p class="score-status">Calculating spacecraft...</p>`;
    container.appendChild(scorePanel);

    const scoreNumber = scorePanel.querySelector(".score-number");
    const scoreFill = scorePanel.querySelector(".score-fill");
    const scoreStatus = scorePanel.querySelector(".score-status");

    const state = { score: 0, advice: "" };

    // ---------- reading / writing sliders ----------
    const readOne = i => norm(Number(sliders[i].value), config.ranges[i]);
    const readNorm = () => sliders.map((_, i) => readOne(i));
    const setN = (i, n) => {
        const [min, max] = config.ranges[i];
        sliders[i].value = min + n * (max - min);   
    };

    // ---------- cost ----------
    function updateCost(n) {
        let total = 0;
        n.forEach((v, i) => { total += v * config.weights[i]; });
        cost.value = Math.round(total * 100);
        costDisplay.textContent = cost.value + "/100";
    }

    // ---------- readiness score ----------
    function updateScore(n) {
        let total = 0;
        let worst = { loss: 0, text: "" };

        n.forEach((v, i) => {
            const diff = v - idealN(config, i, n);
            const err = Math.abs(diff);
            const partScore = Math.max(0, 100 - Math.max(0, err - DEAD_ZONE) * STRICTNESS);
            total += partScore * config.weights[i];

            const message = config.hints[i][diff < 0 ? 0 : 1];
            const loss = (100 - partScore) * config.weights[i];
            if (loss > worst.loss) worst = { loss, text: message };

            if (SHOW_HINTS) {
                const ok = err <= ON_TARGET;
                hintEls[i].textContent = ok ? "✔ On target" : message;
                hintEls[i].className = "slider-hint " + (ok ? "ok" : "warn");
            }
        });

        const finalScore = Math.round(total);
        const changed = state.score !== finalScore;
        state.score = finalScore;
        state.advice = worst.text ? `Biggest problem: ${worst.text}.` : "";

        scoreNumber.textContent = finalScore + "%";
        scoreFill.style.width = finalScore + "%";

        if (finalScore >= 90)              scoreStatus.textContent = "Excellent! Mission ready!";
        else if (finalScore >= LAUNCH_MIN) scoreStatus.textContent = "Good! Cleared for launch.";
        else if (finalScore >= 55)         scoreStatus.textContent = `Almost there. Launch needs ${LAUNCH_MIN}%.`;
        else                               scoreStatus.textContent = "Warning! Spacecraft needs adjustments.";

        if (changed) {
            scoreNumber.classList.remove("score-update");
            void scoreNumber.offsetWidth;
            scoreNumber.classList.add("score-update");
        }
    }

    function updateAll() {
        const n = readNorm();
        sliders.forEach((slider, i) => {
            displays[i].textContent = Number(slider.value).toLocaleString();
        });
        updateCost(n);
        updateScore(n);
    }

    // ---------- linked sliders ----------
    let lastN = readNorm();     // slider positions as of the last change
    let tween = null;           // animation currently dragging dependent sliders

    function flash(el) {
        el.classList.remove("linked-flash");
        void el.offsetWidth;
        el.classList.add("linked-flash");
        el.addEventListener("animationend", () => el.classList.remove("linked-flash"), { once: true });
    }

    function finishTween() {
        if (!tween) return;
        cancelAnimationFrame(tween.id);
        tween.goal.forEach(g => { setN(g.i, g.to); lastN[g.i] = readOne(g.i); });
        tween = null;
    }

    function onSliderMoved(j) {
        finishTween();

        const n = readNorm();
        const goal = [];

        // Walk the later sliders in order so changes cascade (altitude → payload → thrust).
        for (let i = j + 1; i < sliders.length; i++) {
            let change = 0;
            const deps = config.deps[i];
            for (const k in deps) change += deps[k] * (n[k] - lastN[k]);
            if (change === 0) continue;

            const to = clamp01(n[i] + PUSH * change);
            goal.push({ i, from: n[i], to });
            n[i] = to;
        }
        lastN = n;

        if (goal.length) {
            const start = performance.now();
            const duration = 350;
            const step = now => {
                const t = Math.min(1, (now - start) / duration);
                const ease = 1 - Math.pow(1 - t, 3);
                goal.forEach(g => setN(g.i, g.from + (g.to - g.from) * ease));
                updateAll();
                if (t < 1) {
                    tween.id = requestAnimationFrame(step);
                } else {
                    goal.forEach(g => { lastN[g.i] = readOne(g.i); });
                    tween = null;
                }
            };
            tween = { goal, id: requestAnimationFrame(step) };
            goal.forEach(g => flash(displays[g.i]));
        }

        updateAll();
    }

    sliders.forEach((slider, j) => slider.addEventListener("input", () => onSliderMoved(j)));

    // ---------- reset  ----------
    function reset() {
        finishTween();
        sliders.forEach((s, i) => { s.value = defaults[i]; });
        lastN = readNorm();
        submitButton.disabled = false;
        submitButton.textContent = submitText;
        updateAll();
    }

    missionState[missionName] = {
        getScore: () => state.score,
        getAdvice: () => state.advice,
        reset
    };

    updateAll();
}

function resetAllMissions() {
    Object.values(missionState).forEach(m => m.reset());
}

setupMissionSliders("mission1");
setupMissionSliders("mission2");
setupMissionSliders("mission3");