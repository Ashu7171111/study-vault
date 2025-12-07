// app.js — Final version: General Notes renamed to 'Daily Focus / Quick Scratchpad' and Topic Accordion fixed for smooth animation.

console.log("app.js loaded");


const supabase = window.supabase;
if (!supabase) {
  console.error("Supabase client not found on window.supabase. Make sure index.html initializes it before app.js.");
  alert("Supabase not initialized. Check console.");
  throw new Error("Supabase not initialized");
}

/* ---------------- Global state ---------------- */
let currentUser = null;

/* ---------------- DOM elements (expected in index.html) ---------------- */
const subjectListEl = document.getElementById("subjectList"); // sidebar list
const addSubjectBtn = document.getElementById("addSubjectBtn"); // add subject button
const mainEl = document.querySelector(".main"); // main content container

/* ---------------- Helper utilities ---------------- */
function el(tag, attrs = {}, text = "") {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text) e.textContent = text;
  return e;
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function sanitizeFilename(name) {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
}

function getFileNameFromUrl(url) {
  if (!url) return "";
  const parts = url.split("/");
  return parts[parts.length - 1].split('?')[0];
}

/* ---------------- Auth helpers ---------------- */
async function ensureSessionOrRedirect() {
  // Get session; if not present, redirect to login page.
  try {
    const { data } = await supabase.auth.getSession();
    if (!data || !data.session) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error checking session", err);
    window.location.href = "login.html";
    return false;
  }
}

async function fetchCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("getUser error:", error);
    return null;
  }
  currentUser = data?.user || null;
  return currentUser;
}

async function signOutAndRedirect() {
  await supabase.auth.signOut();
  localStorage.removeItem("sb-token");
  window.location.href = "login.html";
}

/* React to auth state changes (keeps currentUser updated) */
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
      window.location.href = "login.html";
    }
  } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
    fetchCurrentUser().then(() => {
      if (typeof loadDashboard === "function") {
        loadSubjects();
        loadDashboard();
      }
    });
  }
});

/* ---------------- General Notes & PDF Handlers (NOW FOR DASHBOARD) ---------------- */

// General Notes are identified by topic_id: null AND subject_id: null
const GENERAL_SUBJECT_ID = null;
const GENERAL_TOPIC_ID = null;

async function loadGeneralNotes(notesBox) {
  notesBox.value = "";
  try {
    const { data: noteData, error: noteErr } = await supabase
      .from("notes")
      .select("id, content, updated_at")
      .is("subject_id", GENERAL_SUBJECT_ID) 
      .is("topic_id", GENERAL_TOPIC_ID) 
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (noteErr) throw noteErr;
    if (noteData) notesBox.value = noteData.content || "";
  } catch (err) {
    console.error("loadGeneralNotes error:", err);
  }
}

async function saveGeneralNotes(content) {
  try {
    const { data: existing, error: existErr } = await supabase
      .from("notes")
      .select("id")
      .is("subject_id", GENERAL_SUBJECT_ID)
      .is("topic_id", GENERAL_TOPIC_ID)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existErr) throw existErr;

    if (existing) {
      const { error } = await supabase
        .from("notes")
        .update({ content, updated_at: new Date().toISOString() })
        .is("subject_id", GENERAL_SUBJECT_ID)
        .is("topic_id", GENERAL_TOPIC_ID)
        .eq("user_id", currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("notes")
        .insert([{ subject_id: GENERAL_SUBJECT_ID, topic_id: GENERAL_TOPIC_ID, content, user_id: currentUser.id }]); 
      if (error) throw error;
    }

    alert("Quick Notes saved!");
    loadDashboard(); // Update dashboard stats
  } catch (err) {
    console.error("save general notes error:", err);
    alert("Error saving quick notes");
  }
}

async function loadGeneralPDFs(pdfBox) {
  pdfBox.innerHTML = "";
  try {
    const { data: pdfs, error } = await supabase
      .from("pdfs")
      .select("id, pdf_url, created_at")
      .is("subject_id", GENERAL_SUBJECT_ID)
      .is("topic_id", GENERAL_TOPIC_ID)
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!pdfs || !pdfs.length) {
      pdfBox.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>No General PDFs uploaded yet</p>";
      return;
    }

    pdfs.forEach((pdf) => {
      const card = document.createElement("div");
      card.className = "pdf-card";
      card.innerHTML = `
        <span class="pdf-icon">📄</span>
        <span class="pdf-file-name">
          <a href="${pdf.pdf_url}" target="_blank">${escapeHtml(getFileNameFromUrl(pdf.pdf_url))}</a>
        </span>
        <span class="pdf-date">Uploaded: ${formatDate(pdf.created_at)}</span>
      `;
      pdfBox.appendChild(card);
    });
  } catch (err) {
    console.error("loadGeneralPDFs error:", err);
    pdfBox.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>Error loading General PDFs</p>";
  }
}

async function uploadGeneralPdf(pdfInput, pdfLinkBox) {
  const file = pdfInput.files[0];
  if (!file) return alert("Choose a PDF first!");
  const safeName = sanitizeFilename(file.name);
  
  // Storage Path: user_id/general/timestamp_filename
  const path = `${currentUser.id}/general/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
  if (uploadError) {
    console.error("upload error:", uploadError);
    return alert("Upload failed");
  }

  const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  // DB Record: using NULL for both IDs
  const { error: dbErr } = await supabase.from("pdfs").insert([
    { subject_id: GENERAL_SUBJECT_ID, topic_id: GENERAL_TOPIC_ID, pdf_url: publicUrl, user_id: currentUser.id } 
  ]);
  if (dbErr) {
    console.error("save pdf record error:", dbErr);
    return alert("Error saving PDF record");
  }

  pdfInput.value = "";
  await loadGeneralPDFs(pdfLinkBox);
  await loadDashboard();
}

/* ---------------- Subjects Edit/Delete ---------------- */
// (Subject functions remain unchanged)
async function editSubjectName(subjectId, currentName) {
  const newName = prompt("Enter new subject name:", currentName);
  if (!newName || newName === currentName) return;

  const { error } = await supabase
    .from("subjects")
    .update({ name: newName })
    .eq("id", subjectId)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("editSubjectName error:", error);
    return alert("Error updating subject name.");
  }

  await loadSubjects();
  const subjectHeader = document.querySelector('.subject-header');
  if (subjectHeader && subjectHeader.getAttribute('data-id') === subjectId) {
    openSubject(subjectId, newName);
  }
}

async function deleteSubject(subjectId, subjectName) {
  if (!confirm(`Are you sure you want to delete the subject "${subjectName}" and all its related Topics, Subtopics, Notes, and PDF records? This action cannot be undone.`)) {
    return;
  }

  try {
    // Subject-level notes/pdfs will be deleted via subject_id cascade if implemented, 
    // or through the topics table deletion if subject_id is the primary link.
    // Assuming DB handles the cascade through the subject_id FK on notes/pdfs/topics
    
    // Delete associated Topics (which should cascade to Subtopics, Topic Notes, Topic PDFs)
    await supabase.from("topics").delete().eq("subject_id", subjectId).eq("user_id", currentUser.id);

    // Delete the subject itself
    const { error: subjectError } = await supabase
      .from("subjects")
      .delete()
      .eq("id", subjectId)
      .eq("user_id", currentUser.id);

    if (subjectError) throw subjectError;

    alert(`Subject "${subjectName}" deleted successfully!`);
    await loadSubjects();
    loadDashboard();
  } catch (error) {
    console.error("deleteSubject error:", error);
    alert("Error deleting subject and its contents. Check RLS policies.");
  }
}

/* ---------------- Topic Edit/Delete ---------------- */
// (Topic functions remain unchanged)
async function editTopicName(topicId, currentName, subjectId, subjectName) {
  const newName = prompt("Enter new topic name:", currentName);
  if (!newName || newName === currentName) return;

  const { error } = await supabase
    .from("topics")
    .update({ name: newName })
    .eq("id", topicId)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("editTopicName error:", error);
    return alert("Error updating topic name.");
  }

  alert("Topic updated!");
  openSubject(subjectId, subjectName); // Reload the subject page
}

async function deleteTopic(topicId, topicName, subjectId, subjectName) {
  if (!confirm(`Are you sure you want to delete the topic "${topicName}" and all its Subtopics, Notes, and PDFs? This action cannot be undone.`)) {
    return;
  }

  try {
    // The cascade rule in the DB schema should handle the deletion of topic-specific notes/pdfs/subtopics.
    const { error: topicError } = await supabase
      .from("topics")
      .delete()
      .eq("id", topicId)
      .eq("user_id", currentUser.id);

    if (topicError) throw topicError;

    alert(`Topic "${topicName}" deleted successfully!`);
    openSubject(subjectId, subjectName); // Reload the subject page
  } catch (error) {
    console.error("deleteTopic error:", error);
    alert("Error deleting topic and its contents. Check RLS policies and table columns.");
  }
}

/* ---------------- Topic-Specific Notes & PDF Handlers ---------------- */

async function loadTopicNotes(topicId, notesBox) {
  notesBox.value = "";
  try {
    const { data: noteData, error: noteErr } = await supabase
      .from("notes")
      .select("id, content, updated_at")
      .eq("topic_id", topicId) 
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (noteErr) throw noteErr;
    if (noteData) notesBox.value = noteData.content || "";
  } catch (err) {
    console.error("loadTopicNotes error:", err);
  }
}

async function saveTopicNotes(topicId, content) {
  try {
    const { data: existing, error: existErr } = await supabase
      .from("notes")
      .select("id, subject_id")
      .eq("topic_id", topicId) 
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existErr) throw existErr;
    
    // Get the subject_id linked to the topic
    const { data: topicData } = await supabase.from('topics').select('subject_id').eq('id', topicId).single();
    const subjectId = topicData ? topicData.subject_id : null;


    if (existing) {
      const { error } = await supabase
        .from("notes")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("topic_id", topicId)
        .eq("user_id", currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("notes")
        .insert([{ subject_id: subjectId, topic_id: topicId, content, user_id: currentUser.id }]);
      if (error) throw error;
    }

    alert("Topic Notes saved!");
  } catch (err) {
    console.error("save topic notes error:", err);
    alert("Error saving topic notes");
  }
}

async function loadTopicPDFs(topicId, pdfBox) {
  pdfBox.innerHTML = "";
  try {
    const { data: pdfs, error } = await supabase
      .from("pdfs")
      .select("id, pdf_url, created_at")
      .eq("topic_id", topicId) 
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!pdfs || !pdfs.length) {
      pdfBox.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>No PDFs uploaded yet</p>";
      return;
    }

    pdfs.forEach((pdf) => {
      const card = document.createElement("div");
      card.className = "pdf-card";
      card.innerHTML = `
        <span class="pdf-icon">📄</span>
        <span class="pdf-file-name">
          <a href="${pdf.pdf_url}" target="_blank">${escapeHtml(getFileNameFromUrl(pdf.pdf_url))}</a>
        </span>
        <span class="pdf-date">Uploaded: ${formatDate(pdf.created_at)}</span>
      `;
      pdfBox.appendChild(card);
    });
  } catch (err) {
    console.error("loadTopicPDFs error:", err);
    pdfBox.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>Error loading PDFs</p>";
  }
}

async function uploadTopicPdf(topicId, subjectId, topicName, pdfInput, pdfLinkBox) {
  const file = pdfInput.files[0];
  if (!file) return alert("Choose a PDF first!");
  const safeName = sanitizeFilename(file.name);
  
  // Storage Path: user_id/subject_id/topic_id/timestamp_filename
  const path = `${currentUser.id}/${subjectId}/${topicId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
  if (uploadError) {
    console.error("upload error:", uploadError);
    return alert("Upload failed");
  }

  const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  // Get the subject_id linked to the topic (necessary for the pdfs table foreign key)
  const { data: topicData } = await supabase.from('topics').select('subject_id').eq('id', topicId).single();
  const subjectIdForDB = topicData ? topicData.subject_id : null;


  // DB Record: using topic_id and subject_id
  const { error: dbErr } = await supabase.from("pdfs").insert([
    { subject_id: subjectIdForDB, topic_id: topicId, pdf_url: publicUrl, user_id: currentUser.id }
  ]);
  if (dbErr) {
    console.error("save pdf record error:", dbErr);
    return alert("Error saving PDF record");
  }

  pdfInput.value = "";
  await loadTopicPDFs(topicId, pdfLinkBox);
  await loadDashboard();
}

/* ---------------- Subjects Loader ---------------- */
// (loadSubjects function remains unchanged)
async function loadSubjects() {
  if (!currentUser) {
    await fetchCurrentUser();
    if (!currentUser) return;
  }

  if (!subjectListEl) return;

  subjectListEl.innerHTML = "";

  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadSubjects error:", error);
    subjectListEl.innerHTML = "<li style='color:#cbd5ff;font-size:13px;'>Error loading subjects</li>";
    return;
  }

  if (!data || !data.length) {
    subjectListEl.innerHTML = "<li style='color:#cbd5ff;font-size:13px;'>No subjects yet</li>";
    return;
  }

  const pastelClasses = ["pastel-1", "pastel-2", "pastel-3", "pastel-4", "pastel-5", "pastel-6"];
  data.forEach((sub, idx) => {
    const li = el("li", { "data-id": sub.id });
    li.classList.add("subject-item", pastelClasses[idx % pastelClasses.length]);
    li.innerHTML = `
      <div class="subject-info">
        <span class="subject-name-text">${escapeHtml(sub.name)}</span>
        <span class="subject-date-text">${formatDate(sub.created_at)}</span>
      </div>
      <div class="subject-actions">
        <button class="btn-icon edit-subject-btn" title="Edit Subject">
          <span class="material-icons" style="font-size:16px;">edit</span>
        </button>
        <button class="btn-icon delete-subject-btn" title="Delete Subject">
          <span class="material-icons" style="font-size:16px;">delete</span>
        </button>
      </div>
    `;

    li.querySelector('.subject-info').addEventListener("click", () => openSubject(sub.id, sub.name));
    
    li.querySelector('.edit-subject-btn').addEventListener("click", (e) => {
      e.stopPropagation();
      editSubjectName(sub.id, sub.name);
    });
    
    li.querySelector('.delete-subject-btn').addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSubject(sub.id, sub.name);
    });

    subjectListEl.appendChild(li);
  });
}

/* Add Subject */
async function addSubjectPrompt() {
  const name = prompt("Enter subject name:");
  if (!name) return;

  const { data, error } = await supabase
    .from("subjects")
    .insert([{ name, user_id: currentUser.id }])
    .select()
    .single();

  if (error) {
    console.error(error);
    return alert("Error adding subject");
  }

  await loadSubjects();
  openSubject(data.id, data.name);
}

/* ---------------- Topic + Subtopic + Notes + PDFs (Subject page - UPDATED) ---------------- */
async function openSubject(subjectId, subjectName) {
  // REMOVED Subject-level Notes and PDFs from this page
  mainEl.innerHTML = `
    <div class="top-row">
      <button class="btn btn-glass back-btn"><span class="material-icons" style="font-size:18px;">arrow_back</span> Dashboard</button>
      <h2 class="subject-header" data-id="${subjectId}"><span class="material-icons">book</span> ${escapeHtml(subjectName)}</h2>
    </div>

    <div class="section-card topic-master-card">
      <div class="section-title"><span class="material-icons">list</span> Topics (with dedicated Notes/PDFs)</div>
      <button id="addTopicBtn" class="btn btn-glass"><span class="material-icons" style="font-size:16px;">add</span> Add Topic</button>
      <div id="topicList" class="topic-list"></div>
    </div>
  `;

  const backBtn = document.querySelector(".back-btn");
  backBtn.addEventListener("click", () => loadDashboard());

  const topicListEl = document.getElementById("topicList");
  const addTopicBtnEl = document.getElementById("addTopicBtn");
  
  // Load topics
  const { data: topics, error: topicsErr } = await supabase
    .from("topics")
    .select("id, name, created_at")
    .eq("subject_id", subjectId)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  topicListEl.innerHTML = "";
  if (topicsErr) {
    console.error("topics load error:", topicsErr);
    topicListEl.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>Error loading topics</p>";
  } else if (!topics || !topics.length) {
    topicListEl.innerHTML = "<p style='font-size:13px;color:#cbd5ff;'>No topics yet</p>";
  } else {
    topics.forEach((t) => {
      // ---------------- Topic Card HTML Structure ----------------
      const card = document.createElement("div");
      card.className = "topic-card";
      card.innerHTML = `
        <div class="topic-header">
          <div class="topic-main">
            <span class="material-icons topic-bullet">radio_button_checked</span>
            <div>
              <div class="topic-name">${escapeHtml(t.name)}</div>
              <div class="topic-date">${formatDate(t.created_at)}</div>
            </div>
          </div>
          <div class="topic-actions">
            <button class="btn-icon edit-topic-btn" title="Edit Topic">
              <span class="material-icons" style="font-size:16px;">edit</span>
            </button>
            <button class="btn-icon delete-topic-btn" title="Delete Topic">
              <span class="material-icons" style="font-size:16px;">delete</span>
            </button>
            <button class="topic-toggle-btn" title="Expand Details"><span class="material-icons">expand_more</span></button>
          </div>
        </div>
        
        <div class="topic-details-content">
            <div class="subtopic-wrapper">
              <h5 style="margin:5px 0;">Subtopics</h5>
              <ul class="subtopic-list"></ul>
              <button class="btn btn-glass add-subtopic-btn"><span class="material-icons" style="font-size:16px;">add</span> Add Subtopic</button>
            </div>

            <hr style="border-top:1px solid rgba(255,255,255,0.1); margin:15px 0;">

            <div class="topic-notes-section">
                <h5 style="margin:5px 0;"><span class="material-icons" style="font-size:16px;">edit_note</span> Topic Notes</h5>
                <textarea id="topicNotesBox_${t.id}" class="notes-area" rows="4" placeholder="Write specific notes for this topic..."></textarea>
                <button id="saveTopicNotesBtn_${t.id}" class="btn btn-primary btn-sm"><span class="material-icons" style="font-size:14px;">save</span> Save Topic Notes</button>
            </div>

            <div class="topic-pdf-section">
                <h5 style="margin:15px 0 5px;"><span class="material-icons" style="font-size:16px;">picture_as_pdf</span> Topic PDFs</h5>
                <div class="upload-row-topic">
                  <label class="upload-drop-topic">
                    <span class="material-icons">cloud_upload</span>
                    <input type="file" id="topicPdfUpload_${t.id}" accept="application/pdf">
                  </label>
                  <button id="uploadTopicPdfBtn_${t.id}" class="btn btn-green btn-sm"><span class="material-icons" style="font-size:14px;">upload</span> Upload PDF</button>
                </div>
                <div id="topicPdfLinkBox_${t.id}"></div>
            </div>
        </div>
      `;
      // ---------------- End Topic Card HTML ----------------

      const toggleBtn = card.querySelector(".topic-toggle-btn");
      const detailsContent = card.querySelector(".topic-details-content");
      const subList = card.querySelector(".subtopic-list");
      const addSubBtn = card.querySelector(".add-subtopic-btn");
      const editBtn = card.querySelector(".edit-topic-btn");
      const deleteBtn = card.querySelector(".delete-topic-btn");
      
      const topicNotesBox = card.querySelector(`#topicNotesBox_${t.id}`);
      const saveTopicNotesBtn = card.querySelector(`#saveTopicNotesBtn_${t.id}`);
      const topicPdfInput = card.querySelector(`#topicPdfUpload_${t.id}`);
      const uploadTopicPdfBtn = card.querySelector(`#uploadTopicPdfBtn_${t.id}`);
      const topicPdfLinkBox = card.querySelector(`#topicPdfLinkBox_${t.id}`);

      // 🔥 FIX: Removed detailsContent.style.display = 'none'; to enable CSS transitions
      
      toggleBtn.addEventListener("click", () => {
        card.classList.toggle("open");
        // 🔥 FIX: Removed detailsContent.style.display logic, now relying purely on CSS's .topic-card.open class
      });

      loadSubtopics(t.id, subList);
      loadTopicNotes(t.id, topicNotesBox);
      loadTopicPDFs(t.id, topicPdfLinkBox);

      editBtn.addEventListener("click", () => {
        editTopicName(t.id, t.name, subjectId, subjectName);
      });

      deleteBtn.addEventListener("click", () => {
        deleteTopic(t.id, t.name, subjectId, subjectName);
      });
      
      saveTopicNotesBtn.addEventListener("click", () => {
        saveTopicNotes(t.id, topicNotesBox.value);
      });

      uploadTopicPdfBtn.addEventListener("click", () => {
        uploadTopicPdf(t.id, subjectId, t.name, topicPdfInput, topicPdfLinkBox);
      });


      addSubBtn.addEventListener("click", async () => {
        const name = prompt("Subtopic name:");
        if (!name) return;
        const { error } = await supabase.from("subtopics").insert([
          { topic_id: t.id, name, user_id: currentUser.id }
        ]);
        if (error) {
          console.error("add subtopic error:", error);
          alert("Error adding subtopic");
        } else {
          loadSubtopics(t.id, subList);
        }
      });

      topicListEl.appendChild(card);
    });
  }

  // add topic handler
  addTopicBtnEl.addEventListener("click", async () => {
    const name = prompt("Topic name:");
    if (!name) return;
    const { error } = await supabase.from("topics").insert([
      { subject_id: subjectId, name, user_id: currentUser.id }
    ]);
    if (error) {
      console.error("add topic error:", error);
      alert("Error adding topic");
    } else {
      openSubject(subjectId, subjectName); // reload
    }
  });
}

/* ---------------- Subtopics loader ---------------- */
async function loadSubtopics(topicId, container) {
  container.innerHTML = "";
  try {
    const { data, error } = await supabase
      .from("subtopics")
      .select("id, name, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!data || !data.length) {
      container.innerHTML = "<p style='font-size:12px;color:#cbd5ff;margin:0;'>No subtopics yet</p>";
      return;
    }

    data.forEach((st) => {
      const li = document.createElement("li");
      li.className = "subtopic-item";
      li.innerHTML = `
        <span class="subtopic-name">${escapeHtml(st.name)}</span>
        <span class="subtopic-date">${formatDate(st.created_at)}</span>
      `;
      container.appendChild(li);
    });
  } catch (err) {
    console.error("loadSubtopics error:", err);
    container.innerHTML = "<p style='font-size:12px;color:#cbd5ff;margin:0;'>Error loading subtopics</p>";
  }
}


/* ---------------- Dashboard (UPDATED) ---------------- */
async function loadDashboard() {
  mainEl.innerHTML = `
    <h2 class="main-title"><span class="material-icons">dashboard</span> Dashboard</h2>
    
    <div class="section-card">
        <div class="section-title"><span class="material-icons">edit_note</span> Daily Focus / Quick Scratchpad</div>
        <textarea id="notesBox" class="notes-area" rows="4" placeholder="Write quick, general notes, reminders, or formulas here..."></textarea>
        <div style="margin-top:10px;"><button id="saveNotesBtn" class="btn btn-primary"><span class="material-icons" style="font-size:16px;">save</span> Save Notes</button></div>
    </div>

    <div class="section-card">
        <div class="section-title"><span class="material-icons">picture_as_pdf</span> General PDFs (Common Materials)</div>
        <div class="upload-row">
            <label class="upload-drop">
                <span class="material-icons">cloud_upload</span>
                <span>Choose or drag a PDF here</span>
                <input type="file" id="pdfUpload" accept="application/pdf">
            </label>
            <button id="uploadPdfBtn" class="btn btn-green"><span class="material-icons" style="font-size:16px;">upload</span> Upload PDF</button>
        </div>
        <h4 class="pdf-list-title">General PDF Files</h4>
        <div id="pdfLinkBox"></div>
    </div>

    <div class="dash-grid">
      <div class="dash-card">
        <div class="dash-card-header"><span class="material-icons">school</span><span>Total Subjects</span></div>
        <p id="totalSubjects" class="dash-number">0</p>
      </div>
      <div class="dash-card">
        <div class="dash-card-header"><span class="material-icons">article</span><span>Total Topics</span></div>
        <p id="totalTopics" class="dash-number">0</p>
      </div>
      <div class="dash-card">
        <div class="dash-card-header"><span class="material-icons">picture_as_pdf</span><span>Total PDFs</span></div>
        <p id="totalPdfs" class="dash-number">0</p>
      </div>
      <div class="dash-card">
        <div class="dash-card-header"><span class="material-icons">history</span><span>Last Updated Note</span></div>
        <p id="lastNote" style="font-size:14px;margin:4px 0 2px;min-height:20px;">—</p>
        <small id="lastNoteDate" style="font-size:11px;color:#cbd5ff;"></small>
      </div>
    </div>
    
    <h3 class="section-heading"><span class="material-icons">description</span> Recent PDFs</h3>
    <ul id="recentPdfsList" class="recent-list"></ul>
  `;

  // General Notes/PDF handlers initialization
  const notesBox = document.getElementById("notesBox");
  const saveNotesBtn = document.getElementById("saveNotesBtn");
  const pdfInput = document.getElementById("pdfUpload");
  const uploadPdfBtn = document.getElementById("uploadPdfBtn");
  const pdfLinkBox = document.getElementById("pdfLinkBox");

  loadGeneralNotes(notesBox);
  saveNotesBtn.addEventListener("click", () => saveGeneralNotes(notesBox.value));
  
  loadGeneralPDFs(pdfLinkBox);
  uploadPdfBtn.addEventListener("click", () => uploadGeneralPdf(pdfInput, pdfLinkBox));
  
  // Dashboard Stats & Recent PDFs
  try {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id")
      .eq("user_id", currentUser.id);
    document.getElementById("totalSubjects").textContent = subjects?.length || 0;

    const { data: topics } = await supabase
      .from("topics")
      .select("id")
      .eq("user_id", currentUser.id);
    document.getElementById("totalTopics").textContent = topics?.length || 0;

    const { data: pdfs } = await supabase
      .from("pdfs")
      .select("id, pdf_url, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    document.getElementById("totalPdfs").textContent = pdfs?.length || 0;

    const { data: lastNote } = await supabase
      .from("notes")
      .select("content, updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastNote && lastNote.content) {
      document.getElementById("lastNote").textContent =
        `"${lastNote.content.substring(0, 50)}..."`;
      if (lastNote.updated_at) {
        document.getElementById("lastNoteDate").textContent =
          `Updated: ${formatDate(lastNote.updated_at)}`;
      }
    } else {
      document.getElementById("lastNote").textContent = "No notes yet";
      document.getElementById("lastNoteDate").textContent = "";
    }

    const listEl = document.getElementById("recentPdfsList");
    listEl.innerHTML = "";
    if (!pdfs || !pdfs.length) {
      listEl.innerHTML =
        "<li style='font-size:13px;color:#cbd5ff;'>No PDFs uploaded</li>";
    } else {
      pdfs.slice(0, 5).forEach((pdf) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span class="pdf-icon">📄</span>
          <span class="pdf-file-name">
            <a href="${pdf.pdf_url}" target="_blank">
              ${escapeHtml(getFileNameFromUrl(pdf.pdf_url))}
            </a>
          </span>
          <span class="pdf-date">Uploaded: ${formatDate(pdf.created_at)}</span>
        `;
        listEl.appendChild(li);
      });
    }
  } catch (err) {
    console.error("dashboard load error:", err);
  }
}

/* ---------------- INIT / Boot ---------------- */
(async function init() {
  const ok = await ensureSessionOrRedirect();
  if (!ok) return;

  await fetchCurrentUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  if (addSubjectBtn) addSubjectBtn.addEventListener("click", addSubjectPrompt);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", signOutAndRedirect);

  await loadSubjects();
  await loadDashboard();
  
})();
