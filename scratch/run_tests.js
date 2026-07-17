import assert from 'assert';

// --- CODE COPIED DIRECTLY FROM APP.TSX FOR QA TESTING (VANILLA JS VERSION) ---

const getSimilarity = (s1, s2) => {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];
  
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const maxLength = Math.max(len1, len2);
  if (maxLength === 0) return 1.0;
  return (maxLength - matrix[len1][len2]) / maxLength;
};

function performJoin(
  dataA,
  dataB,
  joinKeys,
  joinType,
  selectedColsA,
  selectedColsB,
  options
) {
  const { caseInsensitive, trimWhitespace, fuzzyMatch, fuzzyThreshold } = options;

  const getKey = (row, col) => {
    if (!row) return "";
    let val = row[col];
    if (val === undefined || val === null) return "";
    val = String(val);
    if (trimWhitespace) val = val.trim();
    if (caseInsensitive) val = val.toLowerCase();
    return val;
  };

  const result = [];

  if (!fuzzyMatch) {
    // Fast Indexed Join using Composite Keys
    const getCompositeKey = (row, useColA) => {
      return joinKeys.map(jk => getKey(row, useColA ? jk.colA : jk.colB)).join("|||");
    };

    const indexB = new Map();
    dataB.forEach(row => {
      const key = getCompositeKey(row, false);
      if (!indexB.has(key)) indexB.set(key, []);
      indexB.get(key).push(row);
    });

    const matchedKeysB = new Set();

    dataA.forEach(rowA => {
      const keyA = getCompositeKey(rowA, true);
      const matchesB = indexB.get(keyA);

      if (matchesB && matchesB.length > 0) {
        matchedKeysB.add(keyA);
        matchesB.forEach(rowB => {
          const joinedRow = {};
          selectedColsA.forEach(c => {
            joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
          });
          selectedColsB.forEach(c => {
            joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
          });
          result.push(joinedRow);
        });
      } else {
        if (joinType === 'left' || joinType === 'outer') {
          const joinedRow = {};
          selectedColsA.forEach(c => {
            joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
          });
          selectedColsB.forEach(c => {
            joinedRow[c.output] = "";
          });
          result.push(joinedRow);
        }
      }
    });

    if (joinType === 'right' || joinType === 'outer') {
      dataB.forEach(rowB => {
        const keyB = getCompositeKey(rowB, false);
        if (!matchedKeysB.has(keyB)) {
          const joinedRow = {};
          selectedColsA.forEach(c => {
            joinedRow[c.output] = "";
          });
          selectedColsB.forEach(c => {
            joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
          });
          result.push(joinedRow);
        }
      });
    }
  } else {
    // Fuzzy Join (nested loops with threshold)
    const matchedRowsB = new Set();

    dataA.forEach(rowA => {
      let matched = false;

      dataB.forEach(rowB => {
        const firstKeyA = getKey(rowA, joinKeys[0].colA);
        const firstKeyB = getKey(rowB, joinKeys[0].colB);
        const sim = getSimilarity(firstKeyA, firstKeyB);

        if (sim >= fuzzyThreshold) {
          let remainingMatch = true;
          for (let k = 1; k < joinKeys.length; k++) {
            if (getKey(rowA, joinKeys[k].colA) !== getKey(rowB, joinKeys[k].colB)) {
              remainingMatch = false;
              break;
            }
          }

          if (remainingMatch) {
            matched = true;
            matchedRowsB.add(rowB);
            
            const joinedRow = {};
            selectedColsA.forEach(c => {
              joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
            });
            selectedColsB.forEach(c => {
              joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
            });
            result.push(joinedRow);
          }
        }
      });

      if (!matched && (joinType === 'left' || joinType === 'outer')) {
        const joinedRow = {};
        selectedColsA.forEach(c => {
          joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
        });
        selectedColsB.forEach(c => {
          joinedRow[c.output] = "";
        });
        result.push(joinedRow);
      }
    });

    if (joinType === 'right' || joinType === 'outer') {
      dataB.forEach(rowB => {
        if (!matchedRowsB.has(rowB)) {
          const joinedRow = {};
          selectedColsA.forEach(c => {
            joinedRow[c.output] = "";
          });
          selectedColsB.forEach(c => {
            joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
          });
          result.push(joinedRow);
        }
      });
    }
  }

  return result;
}

// --- TEST RUNNER SUITE ---

console.log("==========================================");
console.log("   VMERGE STUDIO FUZZY & MULTI-KEY TESTS  ");
console.log("==========================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`[PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    testsFailed++;
  }
}

// 1. Similarity Engine Checks
runTest("Similarity - Exact match is 1.0", () => {
  assert.strictEqual(getSimilarity("Google", "Google"), 1.0);
});

runTest("Similarity - Empty inputs is 1.0", () => {
  assert.strictEqual(getSimilarity("", ""), 1.0);
});

runTest("Similarity - Close spelling metric", () => {
  const sim = getSimilarity("Google Inc", "Gogle Inc");
  assert.ok(sim >= 0.85 && sim < 1.0);
});

// 2. Fuzzy Join Matching
const dataA = [
  { company: "Google Inc", city: "NYC", val: "100" },
  { company: "Apple Corp", city: "SF", val: "200" }
];
const dataB = [
  { company: "Gogle Inc", city: "NYC", mgr: "Sundar" },
  { company: "Apple Inc", city: "SF", mgr: "Tim" },
  { company: "Microsoft", city: "WA", mgr: "Satya" }
];
const selA = [{ original: "company", output: "CompanyA" }, { original: "val", output: "Value" }];
const selB = [{ original: "mgr", output: "Manager" }];

runTest("Fuzzy Left Join - High Threshold (Should not match loose)", () => {
  const strictOptions = { caseInsensitive: true, trimWhitespace: true, fuzzyMatch: true, fuzzyThreshold: 0.95 };
  const res = performJoin(dataA, dataB, [{ colA: "company", colB: "company" }], "left", selA, selB, strictOptions);
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].Manager, ""); // No match
});

runTest("Fuzzy Left Join - Loose Threshold (Should match misspelled names)", () => {
  const looseOptions = { caseInsensitive: true, trimWhitespace: true, fuzzyMatch: true, fuzzyThreshold: 0.60 };
  const res = performJoin(dataA, dataB, [{ colA: "company", colB: "company" }], "left", selA, selB, looseOptions);
  assert.strictEqual(res.length, 3);
  assert.strictEqual(res[0].Manager, "Sundar"); // Google matching Gogle (sim = 0.90)
  assert.strictEqual(res[1].Manager, "Tim");    // Google matching Apple Inc (sim = 0.60)
  assert.strictEqual(res[2].Manager, "Tim");    // Apple Corp matching Apple Inc (sim = 0.60)
});

// 3. Multi-Key Join matching
const compA = [
  { id: "100", region: "North", sale: "50" },
  { id: "100", region: "South", sale: "80" },
  { id: "200", region: "North", sale: "30" }
];
const compB = [
  { id: "100", region: "North", active: "yes" },
  { id: "100", region: "South", active: "no" }
];
const sColsA = [{ original: "sale", output: "Sale" }];
const sColsB = [{ original: "active", output: "Active" }];

runTest("Multi-Key Composite Join - Multiple match columns", () => {
  const joinKeys = [
    { colA: "id", colB: "id" },
    { colB: "region", colA: "region" } // testing different ordering
  ];
  const joinOptions = { caseInsensitive: true, trimWhitespace: true, fuzzyMatch: false };
  const res = performJoin(compA, compB, joinKeys, "inner", sColsA, sColsB, joinOptions);
  
  assert.strictEqual(res.length, 2);
  assert.deepStrictEqual(res[0], { Sale: "50", Active: "yes" });
  assert.deepStrictEqual(res[1], { Sale: "80", Active: "no" });
});

// 4. Combined Multi-Key and Fuzzy
runTest("Combined - Fuzzy on primary, exact on secondary keys", () => {
  const combineA = [{ comp: "Google Inc", r: "North", val: "10" }];
  const combineB = [
    { comp: "Gogle Inc", r: "North", mgr: "Sundar" },
    { comp: "Gogle Inc", r: "South", mgr: "Sergey" }
  ];
  const keys = [{ colA: "comp", colB: "comp" }, { colA: "r", colB: "r" }];
  const mixedOptions = { caseInsensitive: true, trimWhitespace: true, fuzzyMatch: true, fuzzyThreshold: 0.8 };
  const res = performJoin(combineA, combineB, keys, "inner", [{ original: "val", output: "V" }], [{ original: "mgr", output: "M" }], mixedOptions);
  
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].M, "Sundar"); // matches North, rejects South
});

console.log("==========================================");
console.log(`TEST SUITE RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
console.log("==========================================");

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
