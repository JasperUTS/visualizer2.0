(() => {
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authSubmit = document.getElementById('auth-submit');
  const authToggle = document.getElementById('auth-toggle');
  const authError = document.getElementById('auth-error');
  const mainAppContainer = document.getElementById('main-app-container');

  let isLogin = true;

  // Simple user storage in localStorage
  const USERS_KEY = 'audioVisualizerUsers';
  const CURRENT_USER_KEY = 'audioVisualizerCurrentUser';

  function getUsers() {
    const usersJson = localStorage.getItem(USERS_KEY);
    return usersJson ? JSON.parse(usersJson) : {};
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function setCurrentUser(username) {
    localStorage.setItem(CURRENT_USER_KEY, username);
  }

  function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
  }

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  function showError(message) {
    authError.textContent = message;
  }

  function clearError() {
    authError.textContent = '';
  }

  function switchMode() {
    isLogin = !isLogin;
    if (isLogin) {
      authTitle.textContent = 'Login';
      authSubmit.textContent = 'Login';
      authToggle.textContent = "Don't have an account? Register";
    } else {
      authTitle.textContent = 'Register';
      authSubmit.textContent = 'Register';
      authToggle.textContent = 'Already have an account? Login';
    }
    clearError();
    authForm.reset();
  }

  function validateInput(username, password) {
    if (!username || !password) {
      showError('Username and password are required.');
      return false;
    }
    if (username.length < 3) {
      showError('Username must be at least 3 characters.');
      return false;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return false;
    }
    return true;
  }

  function handleLogin(username, password) {
    const users = getUsers();
    if (!users[username]) {
      showError('User does not exist.');
      return false;
    }
    if (users[username] !== password) {
      showError('Incorrect password.');
      return false;
    }
    setCurrentUser(username);
    return true;
  }

  function handleRegister(username, password) {
    const users = getUsers();
    if (users[username]) {
      showError('Username already taken.');
      return false;
    }
    users[username] = password;
    saveUsers(users);
    setCurrentUser(username);
    return true;
  }

  function showMainApp() {
    authModal.classList.add('hidden');
    mainAppContainer.style.display = 'block';
  }

  function checkLoggedIn() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      showMainApp();
      // Dispatch event to notify visualizer.js to initialize
      window.dispatchEvent(new Event('userLoggedIn'));
    }
  }

  authToggle.addEventListener('click', () => {
    switchMode();
  });

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    const username = authForm.username.value.trim();
    const password = authForm.password.value.trim();

    if (!validateInput(username, password)) {
      return;
    }

    let success = false;
    if (isLogin) {
      success = handleLogin(username, password);
    } else {
      success = handleRegister(username, password);
    }

    if (success) {
      if (isLogin) {
        showMainApp();
        // Notify visualizer.js to initialize
        window.dispatchEvent(new Event('userLoggedIn'));
      } else {
        // After successful registration, switch back to login mode
        switchMode();
        showError('Registration successful. Please log in.');
      }
    }
  });

  // On page load, check if user is already logged in
  document.addEventListener('DOMContentLoaded', () => {
    checkLoggedIn();
  });

  // Expose logout function globally
  window.logout = function() {
    clearCurrentUser();
    mainAppContainer.style.display = 'none';
    authModal.classList.remove('hidden');
    switchMode(); // Reset to login mode
  };
})();
