const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../projets-plan.js');

// demo.js est un script navigateur : on le charge avec un window factice pour appeler todoDemo.data(today)
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8'), ctx);
const demo = ctx.window.todoDemo;
const ymd = d => d.toISOString().slice(0, 10);

test('démo : le projet d\'exemple affiche une alerte de jalon quel que soit le jour', () => {
  for (let i = 0; i < 14; i++) {   // deux semaines : chaque jour de la semaine, week-end compris
    const td = ymd(new Date(Date.UTC(2026, 9, 26 + i)));
    const d = demo.data(td), pj = d.subjects.find(s => s.isProject);
    const steps = d.subjects.filter(s => s.parentId === pj.id);
    const sc = P.schedule(steps, pj.pj.milestones, d.settings.workDays);
    assert.ok(sc.alerts.length > 0, `alerte attendue le ${td}`);
  }
});
