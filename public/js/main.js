const API = "/api/books";
const params = new URLSearchParams(window.location.search);
const editId = params.get("id");

let allBooks = [];
let currentFilter = "all";

function filterBooks(type) {
  currentFilter = type;
  applyFilter();
}

function applyFilter() {
  let filtered = [];

  if (currentFilter === "available") {
    filtered = allBooks.filter(book => book.available == 1);
  } 
  else if (currentFilter === "issued") {
    filtered = allBooks.filter(book => book.available == 0);
  } 
  else {
    filtered = allBooks;
  }

  renderCards(filtered);
}

if (document.getElementById("bookContainer")) {
  loadDashboardBooks();
}

function loadDashboardBooks() {
  fetch(API)
    .then(res => res.json())
    .then(data => {
      allBooks = data;
      applyFilter();
    });
}

function renderCards(data) {
  const container = document.getElementById("bookContainer");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(book => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${book.image}" alt="${book.title}">
      <h3>${book.title}</h3>
      <p>${book.author}</p>
      <p>${book.description}</p>
      <span class="${book.available ? 'available' : 'issued'}">
        ${book.available ? 'Available' : 'Issued'}
      </span>
      <br>

      ${book.available ? `
        <input type="number" id="uid-${book.id}" placeholder="User ID">
        <button onclick="issueById(${book.id})">Issue</button>
      ` : `
        <button onclick="returnBook(${book.id})">Return</button>
      `}
    `;

    container.appendChild(card);
  });

  if (data.length === 0) {
    container.innerHTML = "<p style='text-align:center'>No books found!</p>";
  }
}

if (document.getElementById("bookTable")) {
  loadBooks();
}

function loadBooks() {
  fetch(API)
    .then(res => res.json())
    .then(data => renderTable(data));
}

function renderTable(data) {
  const table = document.getElementById("bookTable");
  if (!table) return;

  const tbody = table.querySelector("tbody") || table;
  tbody.innerHTML = "";

  data.forEach(book => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${book.id}</td>
      <td><img src="${book.image}" width="60"></td>
      <td>${book.title}</td>
      <td>${book.author}</td>
      <td>
        <button onclick="editBook(${book.id})">Update</button>
        <button onclick="deleteBook(${book.id})">Delete</button>
      </td>
    `;

    tbody.appendChild(row);
  });

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No books found!</td></tr>`;
  }
}

const searchInput = document.getElementById("search");
if (searchInput) {
  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(searchBooks, 300);
  });
}

function searchBooks() {
  const query = searchInput.value.trim();

  if (!query) {
    loadDashboardBooks();
    loadBooks();
    return;
  }

  fetch(`${API}/search?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (document.getElementById("bookContainer")) renderCards(data);
      if (document.getElementById("bookTable")) renderTable(data);
    });
}

function clearSearch() {
  if (!searchInput) return;
  searchInput.value = "";
  searchBooks();
}

function editBook(id) {
  window.location.href = `add.html?id=${id}`;
}

function deleteBook(id) {
  fetch(`${API}/${id}`, { method: "DELETE" })
    .then(() => {
      loadDashboardBooks();
      loadBooks();
      showToast("Deleted");
    });
}

function issueById(bookId) {
  const userId = document.getElementById(`uid-${bookId}`).value;

  if (!userId) {
    showToast("Enter User ID", "error");
    return;
  }

  fetch('/api/admin/issue-by-id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      book_id: bookId
    })
  })
  .then(res => res.json())
  .then(data => {
    showToast(data.message);
    loadDashboardBooks();
  });
}

function returnBook(id) {
  fetch(`/api/return/${id}`, { method: "PUT" })
    .then(() => {
      loadDashboardBooks();
      showToast("Returned");
    });
}

const form = document.getElementById("bookForm");
if (form) {
  if (editId) {
    fetch(`${API}/${editId}`)
      .then(res => res.json())
      .then(book => {
        document.getElementById("title").value = book.title;
        document.getElementById("author").value = book.author;
        document.getElementById("description").value = book.description;
      });
  }

  form.addEventListener("submit", e => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("title", document.getElementById("title").value);
    formData.append("author", document.getElementById("author").value);
    formData.append("description", document.getElementById("description").value);

    const imageInput = document.getElementById("image");
    const imageUrlInput = document.getElementById("imageUrl");

    if (imageInput && imageInput.files.length > 0)
      formData.append("image", imageInput.files[0]);
    else if (imageUrlInput)
      formData.append("imageUrl", imageUrlInput.value);

    const url = editId ? `${API}/${editId}` : API;
    const method = editId ? "PUT" : "POST";

    fetch(url, { method, body: formData })
      .then(res => res.json())
      .then(() => {
        showToast(editId ? "Updated" : "Added");
        window.location.href = editId ? "books.html" : "index.html";
      });
  });
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.innerText = message;
  toast.style.backgroundColor = type === "success" ? "#4CAF50" : "#f44336";
  toast.style.display = "block";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => (toast.style.display = "none"), 500);
  }, 2500);
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("hide");
}