function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  try {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  } catch (e) {
    return null;
  }
}

function protectPage(allowedRoles = []) {
  const token = getToken();
  const user = getUser();

  
  if (!token || !user) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
    return;
  }

  
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    document.body.innerHTML = `
      <div style="
        height:100vh;
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        font-family:sans-serif;
        text-align:center;
      ">
        <h1 style="color:red;">Access Denied :(</h1>
        <p>You are logged in as <b>${user.role}</b> So, you do not have permission to access this page.</p>

        <button onclick="goBack()"
          style="
            margin-top:15px;
            padding:10px 20px;
            border:none;
            background:#4f46e5;
            color:white;
            border-radius:8px;
            cursor:pointer;
          ">
          Go Back
        </button>
      </div>
    `;
    return;
  }
}


function goBack() {
  const user = getUser();
  window.location.href = user?.role === "student" ? "/index.html" : "/login.html";
}


function setupSidebar() {
  const user = getUser();
  if (!user) return;

  const reportLink = document.querySelector('a[href="admin-reports.html"]');
  const addBookLink = document.querySelector('a[href="add.html"]');

  if (user.role !== "admin") {
    if (reportLink) reportLink.style.display = "none";
    if (addBookLink) addBookLink.style.display = "none";
  }
}