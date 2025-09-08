const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'donbid', // ใช้ตามจริง
});

module.exports = db;
