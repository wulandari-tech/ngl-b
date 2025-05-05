
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const regMessage = document.getElementById('register-message');
const loginMessage = document.getElementById('login-message');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        regMessage.textContent = ''; // Clear previous message
        regMessage.className = 'message';

        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (response.ok) {
                regMessage.textContent = result.message + ' Redirecting to inbox...';
                regMessage.className = 'message success';
                // Redirect ke inbox setelah berhasil register
                window.location.href = '/inbox';
            } else {
                regMessage.textContent = result.message || 'Registration failed.';
                regMessage.className = 'message error';
            }
        } catch (error) {
            console.error('Register fetch error:', error);
            regMessage.textContent = 'An error occurred during registration.';
            regMessage.className = 'message error';
        }
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginMessage.textContent = ''; // Clear previous message
        loginMessage.className = 'message';


        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (response.ok) {
                loginMessage.textContent = result.message + ' Redirecting to inbox...';
                 loginMessage.className = 'message success';
                // Redirect ke inbox setelah berhasil login
                window.location.href = '/inbox';
            } else {
                loginMessage.textContent = result.message || 'Login failed.';
                loginMessage.className = 'message error';
            }
        } catch (error) {
            console.error('Login fetch error:', error);
            loginMessage.textContent = 'An error occurred during login.';
            loginMessage.className = 'message error';
        }
    });
}