(() => {
  'use strict';

  const PASSWORD = '16December';
  const QUIZ_SIZE = 10;
  const QUIZ_SECONDS = 10 * 60;
  const SUBJECTS = {
    english:   { label: 'English',   icon: '📚' },
    maths:     { label: 'Maths',     icon: '🔢' },
    afrikaans: { label: 'Afrikaans', icon: '🦁' }
  };

  const $ = (id) => document.getElementById(id);
  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } };
  const forget = (key) => { try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ } };

  let user = load('quiz.user', null);      // name of the logged-in child
  let scores = load('quiz.scores', {});    // { "name in lowercase": total points }
  let subject = 'english';
  let quiz = null;                         // the quiz that is currently on screen

  const scoreKey = () => user.trim().toLowerCase();
  const myScore = () => scores[scoreKey()] || 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Compare typed answers ignoring capitals, extra spaces and accents (so "more" matches "môre").
  const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

  /* ---------- Login / logout ---------- */
  function showView() {
    $('login-view').hidden = !!user;
    $('app-view').hidden = !user;
    if (user) {
      $('user-name').textContent = user;
      renderScore(false);
      renderTabs();
      renderStage();
    } else {
      $('name').focus();
    }
  }

  function login(event) {
    event.preventDefault();
    const name = $('name').value.trim();
    const pass = $('password').value;
    const error = $('login-error');
    if (!name) {
      error.textContent = 'Please type your name so we know who you are! 😊';
      $('name').focus();
      return;
    }
    if (pass !== PASSWORD) {
      error.textContent = 'Oops! That is not the right password. Ask a grown-up and try again. 🔑';
      $('password').value = '';
      $('password').focus();
      return;
    }
    error.textContent = '';
    user = name;
    save('quiz.user', user);
    $('password').value = '';
    showView();
  }

  function logout() {
    stopTimer();
    quiz = null;
    user = null;
    forget('quiz.user');
    $('name').value = '';
    $('login-error').textContent = '';
    showView();
  }

  function renderScore(pop) {
    $('global-score').textContent = myScore();
    if (pop) {
      const badge = $('score-badge');
      badge.classList.remove('pop');
      void badge.offsetWidth; // restart the animation
      badge.classList.add('pop');
    }
  }

  /* ---------- Tabs and start screen ---------- */
  function renderTabs() {
    $('app-view').dataset.subject = subject;
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.subject === subject));
    });
  }

  function selectSubject(next) {
    if (next === subject) return;
    if (quiz && !quiz.done && !confirm('Leave this quiz? Your answers will be lost.')) return;
    stopTimer();
    quiz = null;
    subject = next;
    renderTabs();
    renderStage();
  }

  function renderStage() {
    const stage = $('stage');
    stage.replaceChildren();
    stage.className = 'stage';
    const info = SUBJECTS[subject];
    const card = el('div', 'start-card');
    const start = el('button', 'btn big', 'Start Quiz');
    start.type = 'button';
    start.id = 'start';
    start.addEventListener('click', startQuiz);
    card.append(el('div', 'big-icon', info.icon), el('h2', '', info.label + ' Quiz'),
                el('p', '', QUIZ_SIZE + ' questions. 10 minutes. Ready?'), start);
    stage.append(card);
  }

  /* ---------- Quiz ---------- */
  function startQuiz() {
    stopTimer();
    const bank = QUESTION_BANK[subject];
    const picked = shuffle(bank.map((_, i) => i)).slice(0, QUIZ_SIZE).map((i) => bank[i]); // no duplicates
    quiz = {
      subject,
      questions: picked.map((q) => (q.type === 'mc' ? Object.assign({}, q, { options: shuffle(q.options) }) : q)),
      deadline: Date.now() + QUIZ_SECONDS * 1000,
      done: false,
      timer: null
    };
    renderQuiz();
    quiz.timer = setInterval(tick, 250);
    tick();
    window.scrollTo({ top: 0 });
  }

  function renderQuiz() {
    const stage = $('stage');
    stage.replaceChildren();
    stage.className = 'stage quiz';
    const info = SUBJECTS[quiz.subject];

    const bar = el('div', 'quiz-bar');
    const timer = el('div', 'timer', '10:00');
    timer.id = 'timer';
    timer.setAttribute('role', 'timer');
    bar.append(el('div', '', info.icon + ' ' + info.label), timer);

    const result = el('div', 'result');
    result.id = 'result';
    result.hidden = true;

    const list = el('div', 'questions');
    list.id = 'questions';
    quiz.questions.forEach((q, i) => list.append(renderQuestion(q, i)));

    const submit = el('button', 'btn big', 'Submit Answers');
    submit.type = 'button';
    submit.id = 'submit';
    submit.addEventListener('click', () => submitQuiz(false));

    stage.append(bar, result, list, submit);
  }

  function renderQuestion(q, i) {
    const card = el('article', 'qcard');
    card.append(el('div', 'qnum', 'Question ' + (i + 1)), el('p', 'qtext', q.q));
    if (q.type === 'tf') card.append(el('p', 'hint', 'True or False?'));

    const box = el('div', 'answers');
    if (q.type === 'text') {
      const input = el('input', 'text-answer');
      input.type = 'text';
      input.name = 'q' + i;
      input.placeholder = 'Type your answer here';
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('aria-label', 'Your answer for question ' + (i + 1));
      box.append(input);
    } else {
      const choices = q.type === 'tf' ? [['true', 'True ✅'], ['false', 'False ❌']] : q.options.map((o) => [o, o]);
      choices.forEach(([value, label]) => {
        const row = el('label', 'opt');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'q' + i;
        radio.value = value;
        row.dataset.value = value;
        row.append(radio, el('span', 'box', label));
        box.append(row);
      });
    }
    card.append(box, el('p', 'fb'));
    return card;
  }

  function tick() {
    if (!quiz || quiz.done) return;
    const left = Math.max(0, Math.ceil((quiz.deadline - Date.now()) / 1000));
    const timer = $('timer');
    timer.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    timer.classList.toggle('low', left <= 60);
    if (left === 0) submitQuiz(true);
  }

  function stopTimer() {
    if (quiz && quiz.timer) { clearInterval(quiz.timer); quiz.timer = null; }
  }

  const answerText = (q) => (q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.answer);

  function readAnswer(card, q) {
    if (q.type === 'text') return card.querySelector('input').value;
    const checked = card.querySelector('input:checked');
    return checked ? checked.value : '';
  }

  function isRight(q, given) {
    if (q.type === 'text') return given.trim() !== '' && q.accept.some((a) => plain(a) === plain(given));
    return given === String(q.answer);
  }

  function submitQuiz(timeUp) {
    if (!quiz || quiz.done) return;
    quiz.done = true;
    stopTimer();

    const stage = $('stage');
    stage.classList.add('locked');
    stage.querySelectorAll('input').forEach((input) => { input.disabled = true; }); // nothing can change now
    $('submit').hidden = true;

    let right = 0;
    quiz.questions.forEach((q, i) => {
      const card = $('questions').children[i];
      const ok = isRight(q, readAnswer(card, q));
      if (ok) right++;
      card.classList.add(ok ? 'correct' : 'wrong');
      card.querySelector('.fb').textContent = ok ? 'Correct! Well done! 🎉' : 'Not quite. The right answer is: ' + answerText(q);
      card.querySelectorAll('.opt').forEach((row) => {
        if (row.dataset.value === String(q.answer)) row.classList.add('is-answer');
        else if (row.querySelector('input').checked) row.classList.add('picked-wrong');
      });
    });

    scores[scoreKey()] = myScore() + right;
    save('quiz.scores', scores);
    renderScore(true);

    let message = 'Nice effort! Every try makes you smarter. 💪';
    if (right >= 9) message = 'Superstar! Amazing work! 🌟';
    else if (right >= 7) message = 'Great job! Keep it up! 👏';
    else if (right >= 5) message = 'Good try! A little more practice and you will be flying. 🚀';
    if (timeUp) message = "Time's up! ⏰ " + message;

    const result = $('result');
    result.replaceChildren();
    const again = el('button', 'btn big', 'Try Another 10 Questions');
    again.type = 'button';
    again.addEventListener('click', startQuiz);
    result.append(el('div', 'score-line', right + ' / ' + QUIZ_SIZE), el('p', 'res-msg', message), again);
    result.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Start up ---------- */
  $('login-form').addEventListener('submit', login);
  $('logout').addEventListener('click', logout);
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => selectSubject(tab.dataset.subject)));
  if (typeof QUESTION_BANK === 'undefined') {
    document.body.prepend(el('p', 'noscript', 'The questions could not be loaded. Make sure questions.js is next to index.html.'));
  }
  showView();
})();
