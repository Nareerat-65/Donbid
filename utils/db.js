const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'donbid', // ใช้ตามจริง
});

module.exports = db;
