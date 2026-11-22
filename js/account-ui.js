/* Email-backed cloud account for standalone site. VK and Yandex retain their own platform login. */
(() => {
  if (typeof document === 'undefined' || typeof Net === 'undefined' || !window.GEM_SERVER) return;
  if (Net.detect({ YaGames: window.YaGames, vkBridge: window.vkBridge, search: location.search }) !== 'site') return;
  const en = () => typeof I18N !== 'undefined' && I18N.lang === 'en';
  const txt = (ru, english) => en() ? english : ru;
  const KEY = 'gem-match-profile-v2';
  const ui = document.createElement('div');
  ui.className = 'wip-account-modal'; ui.hidden = true;
  ui.innerHTML = `<div class="wip-account-card" role="dialog" aria-modal="true" aria-labelledby="wip-account-title">
    <button type="button" class="wip-account-x" aria-label="Close" data-act="close">✕</button>
    <h2 id="wip-account-title"></h2><p class="wip-account-lead"></p>
    <form id="wip-account-form" autocomplete="on">
      <label class="wip-account-email"><span></span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label class="wip-account-password"><span></span><input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label>
      <button class="primary wip-account-submit" type="submit"></button>
    </form>
    <p class="wip-account-status" role="status" aria-live="polite"></p>
    <nav class="wip-account-links" aria-label="Account actions"></nav>
  </div>`;
  document.body.appendChild(ui);
  const el = (sel) => ui.querySelector(sel);
  const form = el('form'), mailWrap = el('.wip-account-email'), passWrap = el('.wip-account-password'),
    emailInput = form.elements.email, passwordInput = form.elements.password, links = el('.wip-account-links'), status = el('.wip-account-status');
  let mode = 'login', secret = '', busy = false;
  const remote = () => Net.current && Net.current.remote;
  const error = (code) => ({
    try_later: txt('Повторите через минуту.', 'Try again in one minute.'),
    email_not_configured: txt('Сервер ещё не настроен для отправки писем.', 'Email delivery is not configured on the server.'),
    mail_unavailable: txt('Письмо не отправилось. Попробуйте позже.', 'Email could not be sent. Try again later.'),
    credentials: txt('Неверная почта или пароль.', 'Wrong email or password.'),
    verify_required: txt('Сначала подтвердите адрес по письму.', 'Please verify your email first.'),
    email_taken: txt('Такая почта уже зарегистрирована.', 'Email is already in use.'),
    account_exists: txt('У этого героя уже есть почтовый аккаунт.', 'This hero already has an email account.'),
    input: txt('Проверьте адрес и пароль (не короче 12 символов).', 'Check the email and password (12+ characters).'),
    auth: txt('Не удалось связаться с вашим героем на сервере.', 'Could not authorize your hero on the server.'),
    token: txt('Ссылка устарела или уже использована.', 'The link has expired or was used.'),
    site_only: txt('Вход по почте доступен только на сайте игры.', 'Email login is for the standalone website only.'),
  })[code] || txt('Произошла ошибка. Попробуйте снова.', 'Something went wrong. Please try again.');
  const say = (message, danger = false) => { status.textContent = message; status.classList.toggle('bad', danger); };
  const act = (name, text) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = name; b.textContent = text; links.appendChild(b); };
  function show(next) {
    mode = next; say(''); links.replaceChildren(); form.hidden = next === 'pending' || next === 'account';
    mailWrap.hidden = next === 'reset-confirm'; passWrap.hidden = next === 'reset-request';
    emailInput.required = !mailWrap.hidden; passwordInput.required = !passWrap.hidden;
    passwordInput.autocomplete = next === 'register' || next === 'reset-confirm' ? 'new-password' : 'current-password';
    passwordInput.value = '';
    const texts = {
      login: [txt('Войти в аккаунт', 'Sign in'), txt('Продолжите игру с другого устройства.', 'Continue your game on another device.'), txt('Войти', 'Sign in')],
      register: [txt('Сохранить героя', 'Protect your hero'), txt('Привяжите текущего героя к почте. Прогресс останется у вас.', 'Link your current hero to an email account.'), txt('Создать аккаунт', 'Create account')],
      pending: [txt('Подтвердите почту', 'Verify your email'), txt('Мы отправили письмо со ссылкой для подтверждения.', 'We sent a verification link.'), ''],
      'reset-request': [txt('Восстановить доступ', 'Recover your account'), txt('Мы отправим ссылку, если такой аккаунт существует.', 'We will send a link if the account exists.'), txt('Отправить ссылку', 'Send reset link')],
      'reset-confirm': [txt('Новый пароль', 'New password'), txt('Придумайте пароль от 12 символов.', 'Choose a password with at least 12 characters.'), txt('Сохранить пароль', 'Set password')],
      account: [txt('Облачный аккаунт', 'Cloud account'), txt('Ваш герой сохраняется на сервере.', 'Your hero is saved on the server.'), ''],
    };
    const [title, subtitle, submit] = texts[next];
    el('#wip-account-title').textContent = title; el('.wip-account-lead').textContent = subtitle;
    el('.wip-account-submit').textContent = submit;
    mailWrap.querySelector('span').textContent = txt('Почта', 'Email');
    passWrap.querySelector('span').textContent = txt('Пароль', 'Password');
    if (next === 'login') { act('register', txt('Создать аккаунт', 'Create an account')); act('reset-request', txt('Забыли пароль?', 'Forgot password?')); }
    if (next === 'register') act('login', txt('Уже есть аккаунт? Войти', 'Already registered? Sign in'));
    if (next === 'pending') { act('resend', txt('Отправить письмо повторно', 'Resend verification email')); act('login', txt('Войти', 'Sign in')); }
    if (next === 'reset-request' || next === 'reset-confirm') act('login', txt('Вернуться ко входу', 'Back to sign in'));
    if (next === 'account') act('logout', txt('Выйти из аккаунта на этом устройстве', 'Sign out on this device'));
    ui.hidden = false;
  }
  const close = () => { if (!busy) ui.hidden = true; };
  async function open() {
    const r = remote(); if (!r) return;
    show('login');
    try {
      const s = await r.accountStatus();
      if (s.code === 200 && s.json && s.json.email) {
        show(s.json.verified ? 'account' : 'pending');
        say(s.json.email);
      }
    } catch (e) { say(txt('Сервер временно недоступен.', 'Server is temporarily unavailable.'), true); }
  }
  // Do not silently combine two different characters. Keep a local backup before replacement.
  function installProfile(auth) {
    if (!auth || !Net.validPid(auth.pid) || !/^[0-9a-f]{64}$/.test(auth.token)) throw Error('auth');
    const current = localStorage.getItem(KEY);
    let body;
    if (auth.snapshot) {
      const cloud = JSON.parse(auth.snapshot);
      if (!cloud || cloud.pid !== auth.pid) throw Error('snapshot');
      body = auth.snapshot;
    } else if (current && JSON.parse(current).pid === auth.pid) body = current;
    else body = JSON.stringify({ pid: auth.pid }); // first login with no cloud save: a clean character
    if (current && current !== body) localStorage.setItem(KEY + '-device-bak-' + Date.now(), current);
    localStorage.setItem(KEY, body);
    if (!remote().activateAccount(auth)) throw Error('auth');
    location.reload();
  }
  async function submit(evt) {
    evt.preventDefault(); if (busy) return;
    const r = remote(); if (!r) return say(txt('Сервер не подключён.', 'No game server configured.'), true);
    const email = emailInput.value.trim(), password = passwordInput.value;
    busy = true; el('.wip-account-submit').disabled = true;
    try {
      let response;
      if (mode === 'register') {
        if (typeof Profile !== 'undefined' && Profile.save) Profile.save();
        if (Net.current) Net.current.mirror(JSON.stringify(Profile.data));
        if (!Net.current || !(await Net.current.flush())) throw Error('save');
        response = await r.accountRegister(email, password);
        if (response.code === 200) { show('pending'); say(txt('Проверьте почту и откройте ссылку из письма.', 'Check your inbox and open the link.')); return; }
      } else if (mode === 'login') {
        response = await r.accountLogin(email, password);
        if (response.code === 200) return installProfile(response.json);
      } else if (mode === 'reset-request') {
        response = await r.accountResetRequest(email);
        if (response.code === 200) { say(txt('Если почта зарегистрирована, письмо скоро придёт.', 'If the email exists, a reset link will arrive.')); return; }
      } else if (mode === 'reset-confirm') {
        response = await r.accountResetConfirm(secret, password);
        if (response.code === 200) return installProfile(response.json);
      }
      say(error(response && response.json && response.json.error), true);
    } catch (e) { say(e.message === 'save' ? txt('Сначала нужно сохранить героя на сервере. Проверьте подключение.', 'Could not back up the current hero to the server.') : error('unknown'), true); }
    finally { busy = false; el('.wip-account-submit').disabled = false; }
  }
  form.addEventListener('submit', submit);
  ui.addEventListener('click', async (evt) => {
    if (evt.target === ui) return close();
    const b = evt.target.closest('button[data-act]'); if (!b || busy) return;
    const a = b.dataset.act;
    if (a === 'close') return close();
    if (['login', 'register', 'reset-request'].includes(a)) return show(a);
    if (a === 'resend') {
      busy = true; try { const response = await remote().accountResend(); say(response.code === 200 ? txt('Письмо отправлено.', 'Email sent.') : error(response.json && response.json.error), response.code !== 200); } catch(e) { say(error('unknown'), true); } finally { busy = false; }
    }
    if (a === 'logout') {
      if (!confirm(txt('Выйти? Локальная копия будет сохранена в резерве. Прогресс останется на сервере.', 'Sign out? Your local progress will be backed up. Cloud progress stays on the server.'))) return;
      busy = true;
      try {
        if (typeof Profile !== 'undefined' && Profile.save) Profile.save();
        if (Net.current) Net.current.mirror(JSON.stringify(Profile.data));
        if (!(await Net.current.flush())) { say(txt('Нет подтверждения сохранения на сервере. Повторите позже.', 'Cloud save was not confirmed. Try again later.'), true); return; }
        const result = await remote().accountLogout(); if (result.code !== 200) { say(error('unknown'), true); return; }
        const current = localStorage.getItem(KEY); if (current) localStorage.setItem(KEY + '-device-bak-' + Date.now(), current);
        localStorage.removeItem(KEY); localStorage.removeItem('wip-sync-ver'); localStorage.removeItem('wip-guest');
        location.reload();
      } catch(e) { say(error('unknown'), true); }
      finally { busy = false; }
    }
  });
  window.addEventListener('keydown', (evt) => { if (!ui.hidden && evt.key === 'Escape') close(); });
  window.addEventListener('wip-sync-conflict', () => {
    ui.hidden = false; show('account');
    say(txt('Другое устройство обновило героя. Отправка изменений приостановлена, чтобы не потерять прогресс. Войдите снова и загрузите облачную версию.', 'Your hero changed on another device. Uploading is paused to prevent data loss. Sign in again to load the cloud version.'), true);
  });
  function mount() {
    const panel = document.querySelector('#map-menu .mm-main');
    if (!panel) return;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'wip-account-button';
    btn.textContent = txt('☁ Аккаунт и сохранения', '☁ Account and saves');
    const version = panel.querySelector('#map-ver'); panel.insertBefore(btn, version || null);
    btn.addEventListener('click', (event) => { event.stopPropagation(); open(); });
    const h = /^#wip-email-(verify|reset)=([0-9a-f]{64})$/.exec(location.hash);
    if (h) {
      secret = h[2]; history.replaceState(null, '', location.pathname + location.search);
      if (h[1] === 'reset') show('reset-confirm');
      else {
        show('pending'); say(txt('Подтверждаем почту…', 'Verifying your email…'));
        const r = remote(); if (r) r.accountVerify(secret).then((response) => { if (response.code === 200) installProfile(response.json); else say(error(response.json && response.json.error), true); }).catch(() => say(error('unknown'), true));
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
