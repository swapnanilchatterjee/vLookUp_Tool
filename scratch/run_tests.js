import assert from 'assert';

// --- CODE COPIED DIRECTLY FROM APP.TSX FOR QA TESTING (VANILLA JS VERSION) ---

const sanitizeHeaders = (rawHeaders) => {
  const seen = new Map();
  return rawHeaders.map((h, i) => {
    let name = h !== undefined && h !== null ? String(h).trim() : "";
    if (name === "") {
      name = `Column_${i + 1}`;
    }
    if (seen.has(name)) {
      const count = seen.get(name) + 1;
      seen.set(name, count);
      return `${name}_${count}`;
    } else {
      seen.set(name, 1);
      return name;
    }
  });
};

function performJoin(
  dataA,
  dataB,
  joinColA,
  joinColB,
  joinType,
  selectedColsA,
  selectedColsB,
  options
) {
  const getKey = (row, col) => {
    if (!row) return "";
    let val = row[col];
    if (val === undefined || val === null) return "";
    val = String(val);
    if (options.trimWhitespace) val = val.trim();
    if (options.caseInsensitive) val = val.toLowerCase();
    return val;
  };

  const result = [];

  // Index Table B by Join Column B
  const indexB = new Map();
  dataB.forEach(row => {
    const key = getKey(row, joinColB);
    if (!indexB.has(key)) indexB.set(key, []);
    indexB.get(key).push(row);
  });

  const matchedKeysB = new Set();

  // Process Table A Rows
  dataA.forEach(rowA => {
    const keyA = getKey(rowA, joinColA);
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
      // No match in B
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

  // Process Unmatched Table B Rows (for Right & Outer Joins)
  if (joinType === 'right' || joinType === 'outer') {
    dataB.forEach(rowB => {
      const keyB = getKey(rowB, joinColB);
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

  return result;
}

// --- TEST RUNNER SUITE ---

console.log("==========================================");
console.log("   VMERGE STUDIO INTENSE TEST RUNNER      ");
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

// 1. Header Sanitizer Tests
runTest("Header Sanitizer - Basic trimming", () => {
  const headers = [" ID ", "Name", "Age "];
  const cleaned = sanitizeHeaders(headers);
  assert.deepStrictEqual(cleaned, ["ID", "Name", "Age"]);
});

runTest("Header Sanitizer - Blank Columns", () => {
  const headers = ["ID", "", "Age", null, undefined];
  const cleaned = sanitizeHeaders(headers);
  assert.deepStrictEqual(cleaned, ["ID", "Column_2", "Age", "Column_4", "Column_5"]);
});

runTest("Header Sanitizer - Duplicate Columns Suffixing", () => {
  const headers = ["Name", "Age", "Name", "City", "Name"];
  const cleaned = sanitizeHeaders(headers);
  assert.deepStrictEqual(cleaned, ["Name", "Age", "Name_2", "City", "Name_3"]);
});

// 2. Relational Joins Tests
const mockDataA = [
  { id: "1", name: "Alice", dept: "HR" },
  { id: "2", name: "Bob", dept: "Engineering" },
  { id: "3", name: "Charlie", dept: "Marketing" }
];

const mockDataB = [
  { id: "2", manager: "Dan", budget: "10000" },
  { id: "3", manager: "Eva", budget: "5000" },
  { id: "4", manager: "Frank", budget: "2000" }
];

const selectedA = [
  { original: "id", output: "id_A" },
  { original: "name", output: "Name" }
];

const selectedB = [
  { original: "manager", output: "Manager" },
  { original: "budget", output: "Budget" }
];

const options = { caseInsensitive: true, trimWhitespace: true };

runTest("Left Join - Match Lookup Standard", () => {
  const res = performJoin(mockDataA, mockDataB, "id", "id", "left", selectedA, selectedB, options);
  
  assert.strictEqual(res.length, 3);
  assert.deepStrictEqual(res[0], { id_A: "1", Name: "Alice", Manager: "", Budget: "" });
  assert.deepStrictEqual(res[1], { id_A: "2", Name: "Bob", Manager: "Dan", Budget: "10000" });
  assert.deepStrictEqual(res[2], { id_A: "3", Name: "Charlie", Manager: "Eva", Budget: "5000" });
});

runTest("Inner Join - Overlap Only", () => {
  const res = performJoin(mockDataA, mockDataB, "id", "id", "inner", selectedA, selectedB, options);
  
  assert.strictEqual(res.length, 2);
  assert.deepStrictEqual(res[0], { id_A: "2", Name: "Bob", Manager: "Dan", Budget: "10000" });
  assert.deepStrictEqual(res[1], { id_A: "3", Name: "Charlie", Manager: "Eva", Budget: "5000" });
});

runTest("Right Join - Lookup Anchored", () => {
  const res = performJoin(mockDataA, mockDataB, "id", "id", "right", selectedA, selectedB, options);
  
  assert.strictEqual(res.length, 3);
  assert.deepStrictEqual(res[0], { id_A: "2", Name: "Bob", Manager: "Dan", Budget: "10000" });
  assert.deepStrictEqual(res[1], { id_A: "3", Name: "Charlie", Manager: "Eva", Budget: "5000" });
  assert.deepStrictEqual(res[2], { id_A: "", Name: "", Manager: "Frank", Budget: "2000" });
});

runTest("Outer Join - Union Match", () => {
  const res = performJoin(mockDataA, mockDataB, "id", "id", "outer", selectedA, selectedB, options);
  
  assert.strictEqual(res.length, 4);
  assert.deepStrictEqual(res[0], { id_A: "1", Name: "Alice", Manager: "", Budget: "" });
  assert.deepStrictEqual(res[1], { id_A: "2", Name: "Bob", Manager: "Dan", Budget: "10000" });
  assert.deepStrictEqual(res[2], { id_A: "3", Name: "Charlie", Manager: "Eva", Budget: "5000" });
  assert.deepStrictEqual(res[3], { id_A: "", Name: "", Manager: "Frank", Budget: "2000" });
});

// 3. Normalization Tests (Case & Trimming)
runTest("Key Alignment - Case & Whitespace Normalization", () => {
  const dataA = [{ key: "  aBc  ", val: "A" }];
  const dataB = [{ key: "ABC", val: "B" }];
  
  const selA = [{ original: "key", output: "keyA" }, { original: "val", output: "valA" }];
  const selB = [{ original: "val", output: "valB" }];
  
  const res = performJoin(dataA, dataB, "key", "key", "inner", selA, selB, options);
  assert.strictEqual(res.length, 1);
  assert.deepStrictEqual(res[0], { keyA: "  aBc  ", valA: "A", valB: "B" });
});

runTest("Key Alignment - Case Sensitivity strict options", () => {
  const dataA = [{ key: "a", val: "A" }];
  const dataB = [{ key: "A", val: "B" }];
  
  const selA = [{ original: "val", output: "valA" }];
  const selB = [{ original: "val", output: "valB" }];
  
  const strictOptions = { caseInsensitive: false, trimWhitespace: true };
  const res = performJoin(dataA, dataB, "key", "key", "inner", selA, selB, strictOptions);
  assert.strictEqual(res.length, 0); // Should not match due to strict case
});

// 4. One-To-Many (Cartesian Product) matches
runTest("Join Engine - One-to-Many Cartesian verification", () => {
  const dataA = [{ key: "X", name: "RowA" }];
  const dataB = [
    { key: "X", desc: "MatchB1" },
    { key: "X", desc: "MatchB2" }
  ];
  
  const selA = [{ original: "name", output: "Name" }];
  const selB = [{ original: "desc", output: "Desc" }];
  
  const res = performJoin(dataA, dataB, "key", "key", "inner", selA, selB, options);
  assert.strictEqual(res.length, 2);
  assert.deepStrictEqual(res[0], { Name: "RowA", Desc: "MatchB1" });
  assert.deepStrictEqual(res[1], { Name: "RowA", Desc: "MatchB2" });
});

console.log("==========================================");
console.log(`TEST SUITE RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
console.log("==========================================");

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
