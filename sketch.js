// Color Match Game — with start screen + click logging + auto-save
// - Start screen with "START TASK" button
// - Logs: start, colour clicks, All Agree, timer expiry, restart
// - Auto-saves clickLog.json when task ends (and still 'S' to save manually)
// - 8 subjects & 8 colours
// - 15s per slide (auto-advance)
// - if timer ends AND no selection: do nothing (no colour used)
// - if selection exists when advancing: record the answer and mark colour used
// - each recorded answer is randomly marked correct/incorrect at time of recording
// - when ALL colours used -> END OF TASK screen shows answered count + percentage only + Restart
// - tiny corner glitch on advance
// - end screen is rendered every frame so percentage stays visible

let canvasW = 900;
let canvasH = 420;

let slides = [];
let currentSlide = 0;

let palette = [];        // {name, col, used, x, y, w, h}
let selectedIndex = -1;  // selected tile index for this slide

let allAgreeBtn;
let infoP;
let restartBtn = null;

let slideStartMillis = 0;
const SLIDE_SECONDS = 15; // 15s per slide
let timeLeft = SLIDE_SECONDS;
let locked = false;      // after timer expired or AllAgree pressed to prevent changes

// tiny corner glitch variables
let glitchSymbol = null; // 'tick' | 'cross' | null
let glitchVisibleUntil = 0; // millis when symbol disappears
const GLITCH_DURATION = 100; // ms
let advancingInProgress = false; // prevents double-advancing

// record answers: for each slide index store { selected: int (tile index) or -1, correct: boolean/null }
let answers = [];

// end-of-task state
let gameEnded = false;
let endAnsweredCount = 0;
let endCorrectCount = 0;
let endPercentage = 0;

// click log: store every important interaction
let clickLog = [];

// start screen state
let gameStarted = false;
let startBtn;

function setup() {
  let canvas = createCanvas(canvasW, canvasH);
  canvas.parent('sketch-holder');

  // exactly 8 common school subjects
  slides = [
    "Mathematics",
    "English",
    "Science",
    "History",
    "Geography",
    "Art",
    "Music",
    "Physical Education"
  ];

  // prepare answers array
  answers = new Array(slides.length).fill(null);

  // generate 8 distinct colours using HSB
  generatePalette(slides.length);

  // UI: All Agree button
  allAgreeBtn = createButton("All Agree — proceed");
  allAgreeBtn.parent('ui');
  allAgreeBtn.attribute('disabled', ''); // disabled until selection exists or timer expires
  allAgreeBtn.elt.style.opacity = 0.6;
  allAgreeBtn.mousePressed(onAllAgree);

  // Info paragraph (shows slide/time)
  infoP = createP("");
  infoP.parent('ui');

  // slide state ready (but we won't use it until gameStarted = true)
  startSlide();

  // --- START SCREEN UI ---
  startBtn = createButton("START TASK");
  startBtn.parent('ui');
  startBtn.mousePressed(onStartGame);

  infoP.html("");       // hide normal info at start
  allAgreeBtn.hide();   // hide All Agree until game starts
}

function generatePalette(count) {
  palette = [];
  colorMode(HSB, 360, 100, 100);
  for (let i = 0; i < count; i++) {
    let hue = (i * (360 / count)) % 360;
    let sat = 78;
    let bri = 90;
    let c = color(hue, sat, bri);
    palette.push({
      name: `Colour ${i + 1}`,
      col: c,
      used: false,
      x: 0, y: 0, w: 0, h: 0
    });
  }
  colorMode(RGB, 255);
  layoutPalette();
}

function layoutPalette() {
  // single centered row
  let count = palette.length;
  let margin = 40;
  let gap = 12;
  let maxTileW = 92;
  let totalGap = (count - 1) * gap;
  let availableW = width - margin * 2 - totalGap;
  let tileW = constrain(floor(availableW / count), 48, maxTileW);
  let tileH = tileW;
  let totalW = count * tileW + totalGap;
  let startX = (width - totalW) / 2;
  let startY = height - 110;
  for (let i = 0; i < count; i++) {
    palette[i].x = startX + i * (tileW + gap);
    palette[i].y = startY;
    palette[i].w = tileW;
    palette[i].h = tileH;
  }
}

function windowResized() {
  let newW = min(windowWidth - 40, 1200);
  resizeCanvas(newW, canvasH);
  layoutPalette();
}

function startSlide() {
  // If the game already ended, don't restart slides
  if (gameEnded) return;

  selectedIndex = -1;
  locked = false;
  glitchSymbol = null;
  glitchVisibleUntil = 0;
  advancingInProgress = false;
  slideStartMillis = millis();
  timeLeft = SLIDE_SECONDS;

  updateAllAgreeState();
  updateInfo();
}

function draw() {
  // --- START SCREEN ---
  if (!gameStarted) {
    background(14);
    fill(240);
    textAlign(CENTER, CENTER);
    textSize(38);
    text("COLOUR MATCH TASK", width / 2, height / 2 - 40);

    textSize(18);
    fill(200);
    text("Press START to begin", width / 2, height / 2 + 10);
    return; // stop draw here until game starts
  }

  // --- END SCREEN ---
  if (gameEnded) {
    drawEndScreen();
    return;
  }

  // update timer if not locked and not glitching
  if (!locked && !isGlitchActive() && !advancingInProgress) {
    let elapsed = (millis() - slideStartMillis) / 1000.0;
    timeLeft = max(0, SLIDE_SECONDS - elapsed);
    if (timeLeft <= 0) {
      // timer expired -> automatically advance (but only mark answer if selection exists)
      timeLeft = 0;
      locked = true;
      if (!advancingInProgress) {
        initiateAdvanceFromTimer();
      }
    }
  }

  background(18);

  // slide card
  push();
  fill(28);
  stroke(80);
  rect(20, 18, width - 40, height - 150, 10);
  noStroke();
  fill(230);
  textAlign(CENTER, CENTER);
  textSize(44);
  text(slides[currentSlide], width / 2, 70);
  // timer top-right
  textAlign(RIGHT, TOP);
  textSize(18);
  fill(220);
  text(`Time left: ${ceil(timeLeft)}s`, width - 36, 30);
  pop();

  // draw palette
  for (let i = 0; i < palette.length; i++) {
    let p = palette[i];
    if (p.used) {
      push();
      fill(70);
      stroke(120);
      rect(p.x - 2, p.y - 2, p.w + 4, p.h + 4, 8);
      fill(50);
      rect(p.x, p.y, p.w, p.h, 6);
      pop();

      noStroke();
      fill(140);
      textSize(12);
      textAlign(CENTER, TOP);
      text(p.name, p.x + p.w / 2, p.y + p.h + 6);
    } else {
      push();
      fill(p.col);
      stroke(220);
      rect(p.x, p.y, p.w, p.h, 6);
      if (i === selectedIndex) {
        noFill();
        strokeWeight(3);
        stroke(255, 220);
        rect(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 10);
        strokeWeight(1);
      }
      pop();

      noStroke();
      fill(230);
      textSize(12);
      textAlign(CENTER, TOP);
      text(p.name, p.x + p.w / 2, p.y + p.h + 6);
    }
  }

  // used colours count bottom-right
  push();
  textSize(12);
  fill(180);
  textAlign(RIGHT, CENTER);
  let usedCount = palette.filter(p => p.used).length;
  text(`Used colours: ${usedCount} / ${palette.length}`, width - 28, height - 60);
  pop();

  // tiny corner glitch symbol if active
  if (isGlitchActive()) {
    drawTinyCornerGlitch();
  }
}

function mousePressed() {
  if (isGlitchActive() || advancingInProgress) return;
  if (locked) return;
  if (!gameStarted || gameEnded) return;

  for (let i = 0; i < palette.length; i++) {
    let p = palette[i];
    if (!p.used) {
      if (mouseX >= p.x && mouseX <= p.x + p.w && mouseY >= p.y && mouseY <= p.y + p.h) {
        selectedIndex = i;
        updateAllAgreeState();

        // log colour tile clicks
        logClick("COLOUR_CLICK", {
          colourIndex: i,
          colourName: p.name
        });
      }
    }
  }
}

function updateAllAgreeState() {
  let enable = false;
  if (selectedIndex >= 0) enable = true;
  else if (locked && timeLeft <= 0) enable = true; // facilitator override allowed when timer expired
  if (enable) {
    allAgreeBtn.removeAttribute('disabled');
    allAgreeBtn.elt.style.opacity = 1.0;
  } else {
    allAgreeBtn.attribute('disabled', '');
    allAgreeBtn.elt.style.opacity = 0.6;
  }
}

function onAllAgree() {
  if (advancingInProgress || isGlitchActive()) return;
  if (!gameStarted || gameEnded) return;

  locked = true;
  updateAllAgreeState();

  // log All Agree button press
  logClick("ALL_AGREE", {
    hadSelection: selectedIndex >= 0,
    chosenColourIndex: selectedIndex,
    chosenColourName: selectedIndex >= 0 ? palette[selectedIndex].name : null
  });

  // record + mark if selection exists
  if (selectedIndex >= 0) {
    recordAnswer(currentSlide, selectedIndex);
    palette[selectedIndex].used = true;
  } else {
    // facilitator forced next slide without selection
    answers[currentSlide] = { selected: -1, correct: null };
  }

  startTinyGlitchThenAdvance();
}

function initiateAdvanceFromTimer() {
  if (advancingInProgress) return;
  advancingInProgress = true;

  // log timer expiry event
  logClick("TIMER_EXPIRED", {
    hadSelection: selectedIndex >= 0,
    chosenColourIndex: selectedIndex,
    chosenColourName: selectedIndex >= 0 ? palette[selectedIndex].name : null
  });

  // If a selection exists when the timer hits 0, record it and mark used.
  // If there is no selection, do nothing (no record and no colour used).
  if (selectedIndex >= 0) {
    recordAnswer(currentSlide, selectedIndex);
    palette[selectedIndex].used = true;
  } else {
    // do nothing: leave answers[currentSlide] as null to indicate no response
  }

  glitchSymbol = (random() < 0.75) ? 'cross' : 'tick';
  glitchVisibleUntil = millis() + GLITCH_DURATION;

  setTimeout(() => {
    glitchSymbol = null;
    glitchVisibleUntil = 0;
    advanceSlide();
    advancingInProgress = false;
  }, GLITCH_DURATION);
}

function startTinyGlitchThenAdvance() {
  if (advancingInProgress) return;
  advancingInProgress = true;

  glitchSymbol = (random() < 0.75) ? 'cross' : 'tick';
  glitchVisibleUntil = millis() + GLITCH_DURATION;

  setTimeout(() => {
    glitchSymbol = null;
    glitchVisibleUntil = 0;
    advanceSlide();
    advancingInProgress = false;
  }, GLITCH_DURATION);
}

function recordAnswer(slideIndex, tileIndex) {
  // set selected and determine correctness randomly (50/50)
  // This ensures the final percentage is computed from per-question results
  let correct = (random() < 0.5);
  answers[slideIndex] = { selected: tileIndex, correct: correct };
}

function isGlitchActive() {
  return (glitchSymbol !== null && millis() < glitchVisibleUntil);
}

function drawTinyCornerGlitch() {
  push();
  let size = 18;
  textSize(size);
  textAlign(RIGHT, TOP);
  noStroke();
  let margin = 12;
  let x = width - margin;
  let y = margin + 2;
  let jitterX = random(-0.6, 0.6);
  let jitterY = random(-0.6, 0.6);
  if (glitchSymbol === 'cross') {
    fill(220, 60, 60, 230);
    text('✖', x + jitterX, y + jitterY);
  } else {
    fill(80, 210, 120, 230);
    text('✔', x + jitterX, y + jitterY);
  }
  pop();
}

function advanceSlide() {
  // first: check if all colours have been used -> if so, compute end stats and set gameEnded
  let usedCount = palette.filter(p => p.used).length;
  if (usedCount >= palette.length) {
    computeEndStatsAndShow();
    return;
  }

  // otherwise continue to next slide
  currentSlide++;
  // if we've run out of slides, also go to end screen
  if (currentSlide >= slides.length) {
    computeEndStatsAndShow();
    return;
  }
  startSlide();
  updateAllAgreeState();
  updateInfo();
}

function computeEndStatsAndShow() {
  // compute answered count and correctness from recorded answers
  let answeredEntries = answers.filter(a => a && a.selected >= 0);
  endAnsweredCount = answeredEntries.length;
  endCorrectCount = answeredEntries.filter(a => a.correct === true).length;
  endPercentage = endAnsweredCount > 0 ? round((endCorrectCount / endAnsweredCount) * 100) : 0;

  // disable AllAgree
  allAgreeBtn.attribute('disabled', '');
  allAgreeBtn.elt.style.opacity = 0.6;

  // mark game ended so draw() will show end screen every frame
  gameEnded = true;

  // auto-save click log at end of task
  if (clickLog && clickLog.length > 0) {
    saveJSON(clickLog, 'clickLog.json');
  }

  // create restart button if not already created
  if (!restartBtn) {
    restartBtn = createButton("Restart Game");
    restartBtn.parent('ui');
    restartBtn.mousePressed(restartGame);
  }

  // clear info paragraph (we only show end numbers)
  infoP.html("");
}

function drawEndScreen() {
  background(14);
  push();
  fill(240);
  textAlign(CENTER, CENTER);
  textSize(44);
  text("END OF TASK", width / 2, height / 2 - 60);

  textSize(20);
  fill(200);
  text(`Questions answered: ${endAnsweredCount}`, width / 2, height / 2 - 18);
  text(`Accuracy: ${endPercentage}%`, width / 2, height / 2 + 8);
  pop();
}

function restartGame() {
  // log restart event
  logClick("RESTART", {});

  // reset everything: slides, palette used flags, answers, currentSlide, UI
  answers = new Array(slides.length).fill(null);
  for (let i = 0; i < palette.length; i++) {
    palette[i].used = false;
  }
  if (restartBtn) {
    restartBtn.remove();
    restartBtn = null;
  }
  // reset end stats and flag
  gameEnded = false;
  endAnsweredCount = 0;
  endCorrectCount = 0;
  endPercentage = 0;

  currentSlide = 0;
  startSlide();
  updateAllAgreeState();
  updateInfo();

  // back to start screen
  gameStarted = false;
  startBtn.show();
  allAgreeBtn.hide();
}

function updateInfo() {
  let txt = `<strong>Slide:</strong> ${currentSlide + 1} / ${slides.length} &nbsp;` +
            `<strong>Time:</strong> ${ceil(timeLeft)}s`;
  infoP.html(txt);
}

function keyPressed() {
  if (keyCode === RIGHT_ARROW) {
    if (!isGlitchActive() && !advancingInProgress && !gameEnded && gameStarted) onAllAgree();
  } else if (keyCode === LEFT_ARROW) {
    if (!isGlitchActive() && !advancingInProgress && currentSlide > 0 && !gameEnded && gameStarted) {
      currentSlide = max(0, currentSlide - 1);
      startSlide();
    }
  }

  // Extra keys for logging / saving
  if (key === 'l' || key === 'L') {
    console.log("CLICK LOG:", clickLog);
  }

  if (key === 's' || key === 'S') {
    // manual download of click log as JSON file
    if (clickLog && clickLog.length > 0) {
      saveJSON(clickLog, 'clickLog_manual.json');
    }
  }
}

// start button handler
function onStartGame() {
  // log start click
  logClick("START_GAME", {});

  gameStarted = true;

  startBtn.hide();     // remove start button
  allAgreeBtn.show();  // show All Agree button
  startSlide();        // reset timer etc for first slide
}

// generic logger
function logClick(eventType, extra = {}) {
  let entry = {
    event: eventType,
    timeMs: millis(),
    slideIndex: currentSlide,
    selectedIndex: selectedIndex,
    ...extra
  };
  clickLog.push(entry);
  // console.log("Logged:", entry); // uncomment for debug
}
