const API = "/api/books";
const params = new URLSearchParams(window.location.search);
const editId = params.get("id");

// DASHBOARD CARDS 
if (document.getElementById("bookContainer")) {
  loadDashboardBooks();
}

function loadDashboardBooks() {
  fetch(API)
    .then(res => res.json())
    .then(data => renderCards(data))
    .catch(err => console.error("Failed to load dashboard books:", err));
}

function renderCards(data) {
  const container = document.getElementById("bookContainer");
  if (!container) return;

  const existingCards = {};
  container.querySelectorAll(".card").forEach(card => {
    existingCards[card.dataset.id] = card;
  });

  data.forEach(book => {
    let card = existingCards[book.id];
    if (!card) {
      card = document.createElement("div");
      card.className = "card";
      card.dataset.id = book.id;
      container.appendChild(card);
    }

    card.innerHTML = `
      <img src="${book.image}" alt="${book.title}">
      <h3>${book.title}</h3>
      <p>${book.author}</p>
      <p>${book.description}</p>
      <span class="${book.available ? 'available' : 'issued'}">
        ${book.available ? 'Available' : 'Issued'}
      </span>
      <br>
      <button onclick="${book.available ? `issue(${book.id})` : `returnBook(${book.id})`}">
        ${book.available ? 'Issue' : 'Return'}
      </button>
    `;
  });

  // Remove cards not in data
  const dataIds = data.map(b => String(b.id));
  container.querySelectorAll(".card").forEach(card => {
    if (!dataIds.includes(card.dataset.id)) container.removeChild(card);
  });

  if (!data || data.length === 0) {
    container.innerHTML = "<p style='text-align:center'>No books found!</p>";
  }
}

// TABLE 
if (document.getElementById("bookTable")) {
  loadBooks();
}

function loadBooks() {
  fetch(API)
    .then(res => res.json())
    .then(data => renderTable(data))
    .catch(err => console.error("Failed to load books:", err));
}

function renderTable(data) {
  const table = document.getElementById("bookTable");
  if (!table) return;

  const tbody = table.querySelector("tbody") || table;
  const existingRows = {};
  tbody.querySelectorAll("tr[data-id]").forEach(row => {
    existingRows[row.dataset.id] = row;
  });

  data.forEach(book => {
    let row = existingRows[book.id];
    if (!row) {
      row = document.createElement("tr");
      row.dataset.id = book.id;
      tbody.appendChild(row);
    }

    row.innerHTML = `
      <td>${book.id}</td>
      <td><img src="${book.image}" width="60" alt="${book.title}"></td>
      <td>${book.title}</td>
      <td>${book.author}</td>
      <td>
        <button onclick="editBook(${book.id})">Update</button>
        <button onclick="deleteBook(${book.id})">Delete</button>
      </td>
    `;
  });

  // Remove rows not in data
  const dataIds = data.map(b => String(b.id));
  tbody.querySelectorAll("tr[data-id]").forEach(row => {
    if (!dataIds.includes(row.dataset.id)) tbody.removeChild(row);
  });

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No books found!</td></tr>`;
  }
}

// SEARCH DASHBOARD / TABLE 
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
    if (document.getElementById("bookContainer")) loadDashboardBooks();
    if (document.getElementById("bookTable")) loadBooks();
    return;
  }

  fetch(`${API}/search?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (document.getElementById("bookContainer")) renderCards(data);
      else if (document.getElementById("bookTable")) renderTable(data);
    })
    .catch(err => console.error("Search failed:", err));
}

function clearSearch() {
  if (!searchInput) return;
  searchInput.value = "";
  searchBooks(); 
}

//EDIT / DELETE 
function editBook(id) {
  window.location.href = `add.html?id=${id}`;
}

function deleteBook(id) {
  fetch(`${API}/${id}`, { method: "DELETE" })
    .then(() => {
      if (document.getElementById("bookContainer")) loadDashboardBooks();
      if (document.getElementById("bookTable")) loadBooks();
    })
    .catch(err => console.error("Delete failed:", err));
}

// ISSUE / RETURN 
function issue(id) {
  fetch(`/api/issue/${id}`, { method: "PUT" })
    .then(() => loadDashboardBooks())
    .catch(err => console.error("Issue failed:", err));
}

function returnBook(id) {
  fetch(`/api/return/${id}`, { method: "PUT" })
    .then(() => loadDashboardBooks())
    .catch(err => console.error("Return failed:", err));
}

// ADD + EDIT FORM 
const form = document.getElementById("bookForm");
if (form) {
  // Load existing book for edit
  if (editId) {
    fetch(`${API}/${editId}`)
      .then(res => res.json())
      .then(book => {
        document.getElementById("title").value = book.title;
        document.getElementById("author").value = book.author;
        document.getElementById("description").value = book.description;

        if (book.image) {
          const img = document.createElement("img");
          img.src = book.image;
          img.style.width = "100px";
          img.style.marginTop = "10px";
          form.appendChild(img);
        }
      })
      .catch(err => console.error("Failed to load book for edit:", err));
  }

  form.addEventListener("submit", e => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("title", document.getElementById("title").value);
    formData.append("author", document.getElementById("author").value);
    formData.append("description", document.getElementById("description").value);

    const imageInput = document.getElementById("image");
    const imageUrlInput = document.getElementById("imageUrl");
    if (imageInput && imageInput.files.length > 0) formData.append("image", imageInput.files[0]);
    else if (imageUrlInput) formData.append("imageUrl", imageUrlInput.value);

    const url = editId ? `${API}/${editId}` : API;
    const method = editId ? "PUT" : "POST";

    fetch(url, { method, body: formData })
      .then(res => res.json())
      .then(data => {
        alert(editId ? "Book Updated!" : "Book Added!");
        window.location.href = editId ? "books.html" : "index.html";
      })
      .catch(err => {
        console.error("Form submit failed:", err);
        alert("Something went wrong!");
      });
  });
}

//  TOAST 
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = message;
  toast.style.backgroundColor = type === "success" ? "#4CAF50" : "#f44336";
  toast.style.display = "block";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.transition = "opacity 0.5s";
    toast.style.opacity = "0";
    setTimeout(() => (toast.style.display = "none"), 500);
  }, 2500);
}

// SIDEBAR TOGGLE 
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("hide");
}