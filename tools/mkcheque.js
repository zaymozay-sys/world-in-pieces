#!/usr/bin/env node
/* Выдача чека тестировщику: node tools/mkcheque.js <сумма> <номер>  → CHK-<сумма>-<номер>-<подпись>
   Номер — любой уникальный (буквы/цифры до 12 знаков), по нему чек гасится один раз. */
const Bank = require('../js/bank.js');
const [amount, id] = process.argv.slice(2);
if (!(Number(amount) > 0) || !id) { console.log('Использование: node tools/mkcheque.js <сумма> <номер>'); process.exit(1); }
console.log(Bank.makeCheque(Number(amount), id));
