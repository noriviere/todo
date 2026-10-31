const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../projets-plan.js');
const M = require('../metier.js');
// Jours ouvrés comme dans la page : calendrier commun (semaine type, fériés)
const ouvre = d => M.calendrier(M.migrate(JSON.parse(JSON.stringify(d))).settings).ouvre;

// demo.js est un script navigateur : on le charge avec un window factice pour appeler todoDemo.data(today)
const ctx = { window: { todoMetier: require('../metier.js') } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8'), ctx);
const demo = ctx.window.todoDemo;
const ymd = d => d.toISOString().slice(0, 10);

test('démo : le projet d\'exemple affiche une alerte de jalon quel que soit le jour', () => {
  for (let i = 0; i < 14; i++) {   // deux semaines : chaque jour de la semaine, week-end compris
    const td = ymd(new Date(Date.UTC(2026, 9, 26 + i)));
    const d = demo.data(td), pj = d.subjects.find(s => s.isProject);
    const steps = d.subjects.filter(s => s.parentId === pj.id), archived = new Set(steps.filter(s => s.archived).map(s => s.id));
    // Comme la carte du projet : les étapes archivées ne donnent pas d'alerte
    const alerts = P.schedule(steps, pj.pj.milestones, ouvre(d)).alerts.filter(a => !archived.has(a.subjectId));
    assert.ok(alerts.some(a => a.milestoneId === 'm1' && a.subjectId === 's10'), `alerte « Livraison machine » attendue le ${td}`);
  }
});

test('démo : une étape du projet d\'exemple saute un jour férié', () => {
  for (const td of ['2026-10-28', '2026-12-20', '2027-04-30', '2027-08-01']) {
    const d = demo.data(td), pj = d.subjects.find(s => s.isProject);
    const steps = d.subjects.filter(s => s.parentId === pj.id);
    const f = P.schedule(steps, [], ouvre(d)).byId.s15;
    assert.ok(f, `étape planifiée le ${td}`);
    const jours = (Date.parse(f.end) - Date.parse(f.start)) / 864e5 + 1;
    const feries = Object.keys(M.feries(+f.start.slice(0, 4))).concat(Object.keys(M.feries(+f.end.slice(0, 4))));
    assert.ok(feries.some(x => x > f.start && x < f.end), `un férié dans la barre (${f.start} → ${f.end})`);
    assert.ok(jours > 3);
  }
});
