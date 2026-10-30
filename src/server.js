const express = require("express");
const mysql = require("mysql2");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("Gagal terhubung ke MySQL:", err.message);
    return;
  }
  console.log("Berhasil terhubung ke database Aiven MySQL!");
});

// GET: Ambil semua tugas beserta sub-tugasnya
app.get("/api/tasks", (req, res) => {
  const taskQuery = "SELECT * FROM tasks ORDER BY created_at DESC";
  db.query(taskQuery, (err, tasks) => {
    if (err) return res.status(500).json({ error: err.message });

    if (tasks.length === 0) return res.json([]);

    const subQuery = "SELECT * FROM subtasks";
    db.query(subQuery, (err, subtasks) => {
      if (err) return res.status(500).json({ error: err.message });

      const combined = tasks.map((task) => ({
        ...task,
        subtasks: subtasks.filter((s) => s.task_id === task.id),
      }));
      res.json(combined);
    });
  });
});

// POST: Tambah tugas baru beserta sub-tugasnya
app.post("/api/tasks", (req, res) => {
  const { title, description, priority, category, due_date, subtasks } =
    req.body;
  const taskQuery =
    "INSERT INTO tasks (title, description, priority, category, due_date) VALUES (?, ?, ?, ?, ?)";

  db.query(
    taskQuery,
    [title, description, priority, category || "Pekerjaan", due_date || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const taskId = result.insertId;
      if (subtasks && subtasks.length > 0) {
        const subValues = subtasks.map((s) => [
          taskId,
          s.title,
          s.completed || false,
        ]);
        const subQuery =
          "INSERT INTO subtasks (task_id, title, completed) VALUES ?";
        db.query(subQuery, [subValues], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res
            .status(201)
            .json({ id: taskId, message: "Tugas & sub-tugas berhasil dibuat" });
        });
      } else {
        res.status(201).json({ id: taskId, message: "Tugas berhasil dibuat" });
      }
    },
  );
});

// PUT: Update status tugas utama (sekaligus update semua sub-tugas jika di-check/uncheck massal)
app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const { completed, updateSubtasks } = req.body;

  const taskQuery = "UPDATE tasks SET completed = ? WHERE id = ?";
  db.query(taskQuery, [completed, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (updateSubtasks !== undefined) {
      const subQuery = "UPDATE subtasks SET completed = ? WHERE task_id = ?";
      db.query(subQuery, [updateSubtasks, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Status tugas & sub-tugas berhasil diperbarui" });
      });
    } else {
      res.json({ message: "Status tugas diperbarui" });
    }
  });
});

// PUT: Update status sub-tugas & otomatis sinkronisasi status tugas utama
app.put("/api/subtasks/:id", (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  const updateSubQuery = "UPDATE subtasks SET completed = ? WHERE id = ?";
  db.query(updateSubQuery, [completed, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    const getTaskQuery = "SELECT task_id FROM subtasks WHERE id = ?";
    db.query(getTaskQuery, [id], (err, subRows) => {
      if (err || subRows.length === 0)
        return res.status(500).json({ error: "Sub-tugas tidak ditemukan" });

      const taskId = subRows[0].task_id;

      const checkAllQuery = "SELECT completed FROM subtasks WHERE task_id = ?";
      db.query(checkAllQuery, [taskId], (err, allSubtasks) => {
        if (err) return res.status(500).json({ error: err.message });

        const allChecked =
          allSubtasks.length > 0 && allSubtasks.every((s) => s.completed === 1);

        const updateTaskQuery = "UPDATE tasks SET completed = ? WHERE id = ?";
        db.query(updateTaskQuery, [allChecked ? 1 : 0, taskId], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            message: "Sub-tugas & sinkronisasi tugas utama berhasil",
          });
        });
      });
    });
  });
});

// DELETE: Hapus tugas
app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM tasks WHERE id = ?";

  db.query(query, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Tugas berhasil dihapus" });
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
