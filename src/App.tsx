import React, { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  Settings,
  Shuffle,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Download,
  RefreshCw,
  Info,
  Eye,
  Sliders
} from 'lucide-react';
import './App.css';

interface ParsedFile {
  name: string;
  size: number;
  format: string;
  headers: string[];
  data: any[];
}

interface ColumnConfig {
  original: string;
  output: string;
  selected: boolean;
}

function App() {
  // File Upload states
  const [fileA, setFileA] = useState<ParsedFile | null>(null);
  const [fileB, setFileB] = useState<ParsedFile | null>(null);
  const [dragActiveA, setDragActiveA] = useState(false);
  const [dragActiveB, setDragActiveB] = useState(false);

  // File Inputs references
  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  const triggerFileInputA = () => fileInputRefA.current?.click();
  const triggerFileInputB = () => fileInputRefB.current?.click();

  // Join Configuration states
  const [joinKeys, setJoinKeys] = useState<{ colA: string; colB: string }[]>([{ colA: '', colB: '' }]);
  const [joinType, setJoinType] = useState<'left' | 'right' | 'inner' | 'outer'>('left');
  const [fuzzyMatch, setFuzzyMatch] = useState(false);
  const [fuzzyThreshold, setFuzzyThreshold] = useState(0.8);
  
  const [selectedColsA, setSelectedColsA] = useState<ColumnConfig[]>([]);
  const [selectedColsB, setSelectedColsB] = useState<ColumnConfig[]>([]);
  
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [autoClearCache, setAutoClearCache] = useState(true);

  // Output Merged states
  const [joinedData, setJoinedData] = useState<any[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'csv' | 'xlsx'>('csv');
  
  // Banner / Alert status
  const [alert, setAlert] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; message: string } | null>({
    type: 'info',
    message: 'Welcome to VMerge Studio. Upload two CSV or Excel files to begin.'
  });

  // Format File Size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper to sanitize headers (remove trailing space, replace empty names, rename duplicate headers)
  const sanitizeHeaders = (rawHeaders: any[]): string[] => {
    const seen = new Map<string, number>();
    return rawHeaders.map((h, i) => {
      let name = h !== undefined && h !== null ? String(h).trim() : "";
      if (name === "") {
        name = `Column_${i + 1}`;
      }
      if (seen.has(name)) {
        const count = seen.get(name)! + 1;
        seen.set(name, count);
        return `${name}_${count}`;
      } else {
        seen.set(name, 1);
        return name;
      }
    });
  };

  // Helper to parse file (CSV or Excel)
  const parseFile = (file: File, isFileA: boolean) => {
    const fileType = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const rows = results.data as any[][];
          if (rows.length === 0) {
            setAlert({ type: 'error', message: "CSV file is empty" });
            return;
          }
          const rawHeaders = rows[0] || [];
          const cleanHeaders = sanitizeHeaders(rawHeaders);
          
          const csvData = rows.slice(1).map(row => {
            const obj: any = {};
            cleanHeaders.forEach((header, index) => {
              obj[header] = row[index] !== undefined && row[index] !== null ? row[index] : "";
            });
            return obj;
          });
          
          onFileParsed(file.name, file.size, 'CSV', cleanHeaders, csvData, isFileA);
        },
        error: (err) => {
          setAlert({ type: 'error', message: `Error parsing CSV: ${err.message}` });
        }
      });
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const resultData = e.target?.result;
          if (!resultData) {
            throw new Error("Could not read file data.");
          }
          const workbook = XLSX.read(resultData as ArrayBuffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
          if (rows.length === 0) {
            throw new Error("Excel sheet is empty");
          }

          const rawHeaders = rows[0] || [];
          const cleanHeaders = sanitizeHeaders(rawHeaders);
          
          const excelData = rows.slice(1).map(row => {
            const obj: any = {};
            cleanHeaders.forEach((header, index) => {
              obj[header] = row[index] !== undefined && row[index] !== null ? row[index] : "";
            });
            return obj;
          });

          onFileParsed(file.name, file.size, fileType.toUpperCase(), cleanHeaders, excelData, isFileA);
        } catch (err: any) {
          setAlert({ type: 'error', message: `Error parsing Excel: ${err.message || err}` });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setAlert({ type: 'error', message: "Unsupported file type. Please upload a CSV or Excel (.xlsx, .xls) file." });
    }
  };

  const onFileParsed = (
    name: string,
    size: number,
    format: string,
    headers: string[],
    data: any[],
    isFileA: boolean
  ) => {
    const parsedFile: ParsedFile = { name, size, format, headers, data };
    
    if (isFileA) {
      setFileA(parsedFile);
      setJoinKeys(prev => {
        const next = [...prev];
        if (next.length === 0) next.push({ colA: '', colB: '' });
        next[0] = { ...next[0], colA: headers[0] || '' };
        return next;
      });
      setSelectedColsA(headers.map(h => ({
        original: h,
        output: h,
        selected: true
      })));
    } else {
      setFileB(parsedFile);
      setJoinKeys(prev => {
        const next = [...prev];
        if (next.length === 0) next.push({ colA: '', colB: '' });
        next[0] = { ...next[0], colB: headers[0] || '' };
        return next;
      });
      
      // Auto suffix columns that conflict with File A
      const fileACols = fileA ? fileA.headers : [];
      setSelectedColsB(headers.map(h => {
        const conflict = fileACols.includes(h);
        return {
          original: h,
          output: conflict ? `${h}_B` : h,
          selected: true
        };
      }));
    }

    setAlert({
      type: 'success',
      message: `Successfully loaded ${isFileA ? 'Primary' : 'Lookup'} file: ${name} (${data.length} rows)`
    });
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent, isFileA: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      if (isFileA) setDragActiveA(true);
      else setDragActiveB(true);
    } else if (e.type === "dragleave") {
      if (isFileA) setDragActiveA(false);
      else setDragActiveB(false);
    }
  };

  const handleDrop = (e: React.DragEvent, isFileA: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFileA) setDragActiveA(false);
    else setDragActiveB(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseFile(e.dataTransfer.files[0], isFileA);
    }
  };

  const removeFile = (isFileA: boolean) => {
    if (isFileA) {
      setFileA(null);
      setSelectedColsA([]);
    } else {
      setFileB(null);
      setSelectedColsB([]);
    }
    setJoinKeys([{ colA: '', colB: '' }]);
    setJoinedData([]);
    setAlert({ type: 'info', message: `Removed ${isFileA ? 'Primary' : 'Lookup'} file.` });
  };

  const clearAllCache = () => {
    setFileA(null);
    setFileB(null);
    setJoinKeys([{ colA: '', colB: '' }]);
    setSelectedColsA([]);
    setSelectedColsB([]);
    setJoinedData([]);
    setAlert({ type: 'success', message: 'All file cache and memory reset successfully.' });
    if (fileInputRefA.current) fileInputRefA.current.value = '';
    if (fileInputRefB.current) fileInputRefB.current.value = '';
  };

  // Cross-file collision resolver triggered when File A changes
  useEffect(() => {
    if (fileA && fileB) {
      const fileACols = fileA.headers;
      // Re-evaluate B columns to see if there are new conflicts
      setSelectedColsB(prev => prev.map(c => {
        const conflict = fileACols.includes(c.original);
        // Only update if output hasn't been custom-modified by the user yet
        if (c.output === c.original && conflict) {
          return { ...c, output: `${c.original}_B` };
        }
        return c;
      }));
    }
  }, [fileA]);

  // Check duplicate output column names in real-time
  const duplicateOutputNames = useMemo(() => {
    const names = new Set<string>();
    const duplicates = new Set<string>();

    selectedColsA.forEach(c => {
      if (c.selected) {
        if (names.has(c.output)) duplicates.add(c.output);
        else names.add(c.output);
      }
    });

    selectedColsB.forEach(c => {
      if (c.selected) {
        if (names.has(c.output)) duplicates.add(c.output);
        else names.add(c.output);
      }
    });

    return duplicates;
  }, [selectedColsA, selectedColsB]);

  // Check if any selected output column names are left blank
  const hasEmptyOutputNames = useMemo(() => {
    const hasEmptyA = selectedColsA.some(c => c.selected && c.output.trim() === "");
    const hasEmptyB = selectedColsB.some(c => c.selected && c.output.trim() === "");
    return hasEmptyA || hasEmptyB;
  }, [selectedColsA, selectedColsB]);

  // Levenshtein distance function for fuzzy matching
  const getSimilarity = (s1: string, s2: string): number => {
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];
    
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

  const handleJoinKeyChange = (index: number, side: 'colA' | 'colB', value: string) => {
    setJoinKeys(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [side]: value };
      return next;
    });
  };

  const addJoinKeyRow = () => {
    const defaultA = fileA?.headers[0] || '';
    const defaultB = fileB?.headers[0] || '';
    setJoinKeys(prev => [...prev, { colA: defaultA, colB: defaultB }]);
  };

  const removeJoinKeyRow = (index: number) => {
    setJoinKeys(prev => prev.filter((_, i) => i !== index));
  };

  // Core Relational Join logic executed inside a debounced useEffect
  useEffect(() => {
    if (!fileA || !fileB) {
      setJoinedData([]);
      return;
    }

    setIsMerging(true);

    const timer = setTimeout(() => {
      try {
        const activeColsA = selectedColsA.filter(c => c.selected).map(c => ({ original: c.original, output: c.output }));
        const activeColsB = selectedColsB.filter(c => c.selected).map(c => ({ original: c.original, output: c.output }));

        // Standardized Join Logic
        const getKey = (row: any, col: string) => {
          if (!row) return "";
          let val = row[col];
          if (val === undefined || val === null) return "";
          val = String(val);
          if (trimWhitespace) val = val.trim();
          if (caseInsensitive) val = val.toLowerCase();
          return val;
        };

        const result: any[] = [];

        if (!fuzzyMatch) {
          // Fast Indexed Join using Composite Keys
          const getCompositeKey = (row: any, useColA: boolean) => {
            return joinKeys.map(jk => getKey(row, useColA ? jk.colA : jk.colB)).join("|||");
          };

          const indexB = new Map<string, any[]>();
          fileB.data.forEach(row => {
            const key = getCompositeKey(row, false);
            if (!indexB.has(key)) indexB.set(key, []);
            indexB.get(key)!.push(row);
          });

          const matchedKeysB = new Set<string>();

          fileA.data.forEach(rowA => {
            const keyA = getCompositeKey(rowA, true);
            const matchesB = indexB.get(keyA);

            if (matchesB && matchesB.length > 0) {
              matchedKeysB.add(keyA);
              matchesB.forEach(rowB => {
                const joinedRow: any = {};
                activeColsA.forEach(c => {
                  joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
                });
                activeColsB.forEach(c => {
                  joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
                });
                result.push(joinedRow);
              });
            } else {
              if (joinType === 'left' || joinType === 'outer') {
                const joinedRow: any = {};
                activeColsA.forEach(c => {
                  joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
                });
                activeColsB.forEach(c => {
                  joinedRow[c.output] = "";
                });
                result.push(joinedRow);
              }
            }
          });

          if (joinType === 'right' || joinType === 'outer') {
            fileB.data.forEach(rowB => {
              const keyB = getCompositeKey(rowB, false);
              if (!matchedKeysB.has(keyB)) {
                const joinedRow: any = {};
                activeColsA.forEach(c => {
                  joinedRow[c.output] = "";
                });
                activeColsB.forEach(c => {
                  joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
                });
                result.push(joinedRow);
              }
            });
          }
        } else {
          // Fuzzy Join (nested loops with threshold)
          const matchedRowsB = new Set<any>();

          fileA.data.forEach(rowA => {
            let matched = false;

            fileB.data.forEach(rowB => {
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
                  
                  const joinedRow: any = {};
                  activeColsA.forEach(c => {
                    joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
                  });
                  activeColsB.forEach(c => {
                    joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
                  });
                  result.push(joinedRow);
                }
              }
            });

            if (!matched && (joinType === 'left' || joinType === 'outer')) {
              const joinedRow: any = {};
              activeColsA.forEach(c => {
                joinedRow[c.output] = rowA[c.original] !== undefined ? rowA[c.original] : "";
              });
              activeColsB.forEach(c => {
                joinedRow[c.output] = "";
              });
              result.push(joinedRow);
            }
          });

          if (joinType === 'right' || joinType === 'outer') {
            fileB.data.forEach(rowB => {
              if (!matchedRowsB.has(rowB)) {
                const joinedRow: any = {};
                activeColsA.forEach(c => {
                  joinedRow[c.output] = "";
                });
                activeColsB.forEach(c => {
                  joinedRow[c.output] = rowB[c.original] !== undefined ? rowB[c.original] : "";
                });
                result.push(joinedRow);
              }
            });
          }
        }

        setJoinedData(result);
        if (duplicateOutputNames.size > 0) {
          setAlert({
            type: 'warning',
            message: `Column Name Conflict: Dual output mapping detected for names: [${Array.from(duplicateOutputNames).join(', ')}]. Please rename conflicting output headers below to avoid row overwrites.`
          });
        } else if (hasEmptyOutputNames) {
          setAlert({
            type: 'warning',
            message: 'Empty Header Warning: One or more selected output columns have empty names. Please enter a valid header name.'
          });
        } else if (fuzzyMatch && (fileA.data.length > 2000 || fileB.data.length > 2000)) {
          setAlert({
            type: 'warning',
            message: `Large Dataset Warning: Fuzzy matching on ${fileA.data.length}x${fileB.data.length} rows may cause browser latency. It is recommended for smaller datasets.`
          });
        } else {
          setAlert(null);
        }
      } catch (err: any) {
        setAlert({ type: 'error', message: `Join Engine Failure: ${err.message}` });
      } finally {
        setIsMerging(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [
    fileA,
    fileB,
    joinKeys,
    joinType,
    selectedColsA,
    selectedColsB,
    caseInsensitive,
    trimWhitespace,
    duplicateOutputNames,
    hasEmptyOutputNames,
    fuzzyMatch,
    fuzzyThreshold
  ]);

  // Export File & Download Trigger
  const downloadMergedFile = () => {
    if (joinedData.length === 0) {
      setAlert({ type: 'error', message: "Nothing to download. Please verify your datasets and join configuration." });
      return;
    }

    if (duplicateOutputNames.size > 0) {
      setAlert({ type: 'error', message: "Cannot export with duplicate output column names. Please rename conflicting headers first." });
      return;
    }

    if (hasEmptyOutputNames) {
      setAlert({ type: 'error', message: "Cannot export with blank output column names. Please rename or deselect them." });
      return;
    }

    try {
      const baseName = `merged_${fileA?.name.split('.')[0]}_${fileB?.name.split('.')[0]}`;
      const filename = `${baseName}_export_${Date.now()}.${outputFormat}`;

      if (outputFormat === 'csv') {
        const csvContent = Papa.unparse(joinedData);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(joinedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Joined Dataset");
        XLSX.writeFile(workbook, filename);
      }

      setAlert({
        type: 'success',
        message: `Merge successful! Exported ${joinedData.length} records. File downloaded as: ${filename}`
      });

      if (autoClearCache) {
        setTimeout(() => {
          clearAllCache();
          setAlert({
            type: 'success',
            message: `Merge completed! Memory cache cleared automatically for maximum browser security.`
          });
        }, 2000);
      }
    } catch (err: any) {
      setAlert({ type: 'error', message: `Export engine encountered an error: ${err.message}` });
    }
  };

  // Helper toggle lists
  const selectAllA = (status: boolean) => {
    setSelectedColsA(prev => prev.map(c => ({ ...c, selected: status })));
  };

  const selectAllB = (status: boolean) => {
    setSelectedColsB(prev => prev.map(c => ({ ...c, selected: status })));
  };

  const updateRenameA = (index: number, val: string) => {
    setSelectedColsA(prev => {
      const next = [...prev];
      next[index] = { ...next[index], output: val };
      return next;
    });
  };

  const updateRenameB = (index: number, val: string) => {
    setSelectedColsB(prev => {
      const next = [...prev];
      next[index] = { ...next[index], output: val };
      return next;
    });
  };

  const toggleSelectColA = (index: number) => {
    setSelectedColsA(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  };

  const toggleSelectColB = (index: number) => {
    setSelectedColsB(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  };

  // Preview rows list limit to 10
  const previewRows = useMemo(() => {
    return joinedData.slice(0, 10);
  }, [joinedData]);

  // Headers for preview
  const previewHeaders = useMemo(() => {
    if (joinedData.length === 0) return [];
    return Object.keys(joinedData[0]);
  }, [joinedData]);

  return (
    <>
      {/* Header Section */}
      <header className="header animate-fade-in">
        <div className="logo-container">
          <Shuffle className="logo-icon" />
          <h1>VMerge Studio</h1>
        </div>
        <p>Local-First CSV & Excel Dynamic Joining Engine</p>
      </header>

      {/* Global Alert Banner */}
      {alert && (
        <div className={`alert-banner ${alert.type} animate-fade-in`}>
          {alert.type === 'success' ? (
            <CheckCircle2 className="alert-banner-icon" />
          ) : alert.type === 'error' ? (
            <AlertCircle className="alert-banner-icon" />
          ) : alert.type === 'warning' ? (
            <AlertCircle className="alert-banner-icon" />
          ) : (
            <Info className="alert-banner-icon" />
          )}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Main Grid: File Uploads */}
      <main className="upload-grid animate-fade-in">
        
        {/* File A Card */}
        <section className="glass-card upload-card">
          <div className="card-title">
            <div className="card-title-text">
              <FileSpreadsheet />
              <span>Primary Dataset (File A)</span>
            </div>
            {fileA && (
              <span className="badge badge-primary">{fileA.format}</span>
            )}
          </div>

          {!fileA ? (
            <div
              className={`drop-zone ${dragActiveA ? 'active' : ''}`}
              onDragEnter={(e) => handleDrag(e, true)}
              onDragOver={(e) => handleDrag(e, true)}
              onDragLeave={(e) => handleDrag(e, true)}
              onDrop={(e) => handleDrop(e, true)}
              onClick={triggerFileInputA}
            >
              <input
                ref={fileInputRefA}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => e.target.files && parseFile(e.target.files[0], true)}
                style={{ display: 'none' }}
              />
              <UploadCloud className="drop-icon" />
              <p>Drag and drop File A here, or click to browse</p>
              <span>Supports .csv, .xlsx, .xls</span>
            </div>
          ) : (
            <div className="file-details">
              <div className="file-header">
                <FileSpreadsheet className="file-icon" />
                <div className="file-meta">
                  <div className="file-name" title={fileA.name}>{fileA.name}</div>
                  <div className="file-size">{formatBytes(fileA.size)}</div>
                </div>
                <button className="btn btn-secondary btn-danger" style={{ padding: '0.45rem' }} onClick={() => removeFile(true)}>
                  <Trash2 style={{ width: '1.1rem', height: '1.1rem' }} />
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Total Rows</div>
                  <div className="stat-value">{fileA.data.length}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Columns Detected</div>
                  <div className="stat-value">{fileA.headers.length}</div>
                </div>
              </div>

              <div className="column-list-preview">
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Columns list preview:</div>
                <div className="column-chips">
                  {fileA.headers.map((h, i) => (
                    <span key={i} className="column-chip">{h}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* File B Card */}
        <section className="glass-card upload-card">
          <div className="card-title">
            <div className="card-title-text">
              <FileSpreadsheet />
              <span>Lookup Dataset (File B)</span>
            </div>
            {fileB && (
              <span className="badge badge-primary">{fileB.format}</span>
            )}
          </div>

          {!fileB ? (
            <div
              className={`drop-zone ${dragActiveB ? 'active' : ''}`}
              onDragEnter={(e) => handleDrag(e, false)}
              onDragOver={(e) => handleDrag(e, false)}
              onDragLeave={(e) => handleDrag(e, false)}
              onDrop={(e) => handleDrop(e, false)}
              onClick={triggerFileInputB}
            >
              <input
                ref={fileInputRefB}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => e.target.files && parseFile(e.target.files[0], false)}
                style={{ display: 'none' }}
              />
              <UploadCloud className="drop-icon" />
              <p>Drag and drop File B here, or click to browse</p>
              <span>Supports .csv, .xlsx, .xls</span>
            </div>
          ) : (
            <div className="file-details">
              <div className="file-header">
                <FileSpreadsheet className="file-icon" />
                <div className="file-meta">
                  <div className="file-name" title={fileB.name}>{fileB.name}</div>
                  <div className="file-size">{formatBytes(fileB.size)}</div>
                </div>
                <button className="btn btn-secondary btn-danger" style={{ padding: '0.45rem' }} onClick={() => removeFile(false)}>
                  <Trash2 style={{ width: '1.1rem', height: '1.1rem' }} />
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Total Rows</div>
                  <div className="stat-value">{fileB.data.length}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Columns Detected</div>
                  <div className="stat-value">{fileB.headers.length}</div>
                </div>
              </div>

              <div className="column-list-preview">
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Columns list preview:</div>
                <div className="column-chips">
                  {fileB.headers.map((h, i) => (
                    <span key={i} className="column-chip">{h}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Config Section (Only when both files are uploaded) */}
      {fileA && fileB && (
        <section className="glass-card config-section animate-fade-in">
          <div className="section-header">
            <Settings className="section-icon" />
            <h2 className="section-title">Configure Relational Join</h2>
          </div>

          {/* Join Key Selection List */}
          <div className="form-group">
            <div className="join-keys-list">
              {joinKeys.map((keyRow, index) => (
                <div key={index} className="join-key-row">
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Match Column from File A</label>
                    <select
                      className="select-control"
                      value={keyRow.colA}
                      onChange={(e) => handleJoinKeyChange(index, 'colA', e.target.value)}
                    >
                      {fileA.headers.map((h, i) => (
                        <option key={i} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Matches Column from File B</label>
                    <select
                      className="select-control"
                      value={keyRow.colB}
                      onChange={(e) => handleJoinKeyChange(index, 'colB', e.target.value)}
                    >
                      {fileB.headers.map((h, i) => (
                        <option key={i} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {joinKeys.length > 1 && (
                      <button
                        className="btn btn-secondary btn-danger btn-icon-only"
                        type="button"
                        onClick={() => removeJoinKeyRow(index)}
                        style={{ height: '42px', width: '42px' }}
                      >
                        <Trash2 style={{ width: '1rem', height: '1rem' }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={addJoinKeyRow}
              style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
              + Add Match Key
            </button>
          </div>

          {/* Join Type Selectors */}
          <div className="form-group">
            <label className="form-label">Join Type Strategy</label>
            <div className="join-types-selector">
              <div
                className={`join-type-card ${joinType === 'left' ? 'selected' : ''}`}
                onClick={() => setJoinType('left')}
              >
                <div className="join-type-title">Left Join</div>
                <div className="join-type-desc">All rows of File A, with matched values from B (VLookup standard).</div>
              </div>

              <div
                className={`join-type-card ${joinType === 'inner' ? 'selected' : ''}`}
                onClick={() => setJoinType('inner')}
              >
                <div className="join-type-title">Inner Join</div>
                <div className="join-type-desc">Only rows where the selected columns have matches in both files.</div>
              </div>

              <div
                className={`join-type-card ${joinType === 'right' ? 'selected' : ''}`}
                onClick={() => setJoinType('right')}
              >
                <div className="join-type-title">Right Join</div>
                <div className="join-type-desc">All rows of File B, with matched values from A.</div>
              </div>

              <div
                className={`join-type-card ${joinType === 'outer' ? 'selected' : ''}`}
                onClick={() => setJoinType('outer')}
              >
                <div className="join-type-title">Full Outer Join</div>
                <div className="join-type-desc">All rows from both files. Merges matching lines where keys intersect.</div>
              </div>
            </div>
          </div>

          {/* Match Parameters Options */}
          <div className="options-panel">
            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-control"
                checked={caseInsensitive}
                onChange={(e) => setCaseInsensitive(e.target.checked)}
              />
              <span>Case-Insensitive Match (e.g. "key" matches "KEY")</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-control"
                checked={trimWhitespace}
                onChange={(e) => setTrimWhitespace(e.target.checked)}
              />
              <span>Trim Whitespace (ignores leading/trailing spaces)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-control"
                checked={fuzzyMatch}
                onChange={(e) => setFuzzyMatch(e.target.checked)}
              />
              <span style={{ color: 'var(--primary-hover)', fontWeight: 600 }}>Enable Fuzzy Match (Levenshtein Distance)</span>
            </label>
          </div>

          {/* Fuzzy Threshold Slider */}
          {fuzzyMatch && (
            <div className="slider-container animate-fade-in" style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
              <div className="slider-header">
                <span>Fuzzy Match Similarity Threshold</span>
                <span style={{ color: 'var(--primary-hover)', fontWeight: 600 }}>{Math.round(fuzzyThreshold * 100)}% Match</span>
              </div>
              <input
                type="range"
                className="range-input"
                min="0.5"
                max="1.0"
                step="0.05"
                value={fuzzyThreshold}
                onChange={(e) => setFuzzyThreshold(parseFloat(e.target.value))}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Note: Fuzzy matching evaluates string similarity on the primary match key. Lower percentages accept looser spelling matches.
              </div>
            </div>
          )}

          {/* Dynamic Column Schema Setup */}
          <div className="section-header" style={{ borderBottom: 'none', marginBottom: '0.5rem' }}>
            <Sliders className="section-icon" />
            <h2 className="section-title">Map Output Fields & Schema</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            Select which columns will appear in your merged file and dynamically rename their output headers.
          </p>

          <div className="schema-grid">
            
            {/* File A Schema */}
            <div className="glass-card schema-column-card" style={{ background: 'rgba(0, 0, 0, 0.1)' }}>
              <div className="schema-headers-bar">
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>File A Columns</span>
                <div className="quick-actions">
                  <button className="btn btn-secondary btn-xs" onClick={() => selectAllA(true)}>Select All</button>
                  <button className="btn btn-secondary btn-xs" onClick={() => selectAllA(false)}>Deselect All</button>
                </div>
              </div>

              <div className="schema-list">
                {selectedColsA.map((col, index) => {
                  const isConflict = duplicateOutputNames.has(col.output) && col.selected;
                  return (
                    <div key={index} className={`schema-item ${col.selected ? 'selected' : ''} ${isConflict ? 'conflict-warning' : ''}`}>
                      <input
                        type="checkbox"
                        className="checkbox-control"
                        checked={col.selected}
                        onChange={() => toggleSelectColA(index)}
                      />
                      <div className="schema-col-info">
                        <div className="schema-col-name" title={col.original}>
                          {col.original}
                          {joinKeys.some(jk => jk.colA === col.original) && (
                            <span className="badge badge-success" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>Match Key</span>
                          )}
                        </div>
                      </div>
                      {col.selected && (
                        <input
                          type="text"
                          className="schema-rename-input"
                          value={col.output}
                          placeholder="Output Header..."
                          onChange={(e) => updateRenameA(index, e.target.value)}
                          title="Dynamic column rename"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* File B Schema */}
            <div className="glass-card schema-column-card" style={{ background: 'rgba(0, 0, 0, 0.1)' }}>
              <div className="schema-headers-bar">
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>File B Columns</span>
                <div className="quick-actions">
                  <button className="btn btn-secondary btn-xs" onClick={() => selectAllB(true)}>Select All</button>
                  <button className="btn btn-secondary btn-xs" onClick={() => selectAllB(false)}>Deselect All</button>
                </div>
              </div>

              <div className="schema-list">
                {selectedColsB.map((col, index) => {
                  const isConflict = duplicateOutputNames.has(col.output) && col.selected;
                  return (
                    <div key={index} className={`schema-item ${col.selected ? 'selected' : ''} ${isConflict ? 'conflict-warning' : ''}`}>
                      <input
                        type="checkbox"
                        className="checkbox-control"
                        checked={col.selected}
                        onChange={() => toggleSelectColB(index)}
                      />
                      <div className="schema-col-info">
                        <div className="schema-col-name" title={col.original}>
                          {col.original}
                          {joinKeys.some(jk => jk.colB === col.original) && (
                            <span className="badge badge-success" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>Match Key</span>
                          )}
                        </div>
                      </div>
                      {col.selected && (
                        <input
                          type="text"
                          className="schema-rename-input"
                          value={col.output}
                          placeholder="Output Header..."
                          onChange={(e) => updateRenameB(index, e.target.value)}
                          title="Dynamic column rename"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </section>
      )}

      {/* Preview Section */}
      {fileA && fileB && (
        <section className="glass-card preview-section animate-fade-in">
          <div className="section-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Eye className="section-icon" />
              <h2 className="section-title">
                Live Output Preview
                {isMerging && (
                  <RefreshCw className="spinner" style={{ marginLeft: '0.75rem', width: '1rem', height: '1rem', color: 'var(--primary)' }} />
                )}
              </h2>
            </div>
            {joinedData.length > 0 && (
              <span className="badge badge-success">
                {joinedData.length} records matched
              </span>
            )}
          </div>

          <div className="table-wrapper">
            {joinedData.length > 0 ? (
              <table className="preview-table">
                <thead>
                  <tr>
                    {previewHeaders.map((header, i) => (
                      <th key={i}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {previewHeaders.map((header, j) => (
                        <td key={j} title={String(row[header])}>
                          {row[header] !== undefined && row[header] !== null ? String(row[header]) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-preview">
                {isMerging ? 'Updating join map...' : 'No matches found based on the current keys. Verify matching values.'}
              </div>
            )}
          </div>
          {joinedData.length > 10 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.5rem' }}>
              Showing first 10 rows of {joinedData.length} matching rows.
            </div>
          )}
        </section>
      )}

      {/* Export Section */}
      {fileA && fileB && (
        <div className="actions-panel animate-fade-in">
          <div className="format-picker">
            <button
              className={`format-btn ${outputFormat === 'csv' ? 'active' : ''}`}
              onClick={() => setOutputFormat('csv')}
            >
              CSV
            </button>
            <button
              className={`format-btn ${outputFormat === 'xlsx' ? 'active' : ''}`}
              onClick={() => setOutputFormat('xlsx')}
            >
              EXCEL
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={downloadMergedFile}
            disabled={joinedData.length === 0 || duplicateOutputNames.size > 0 || hasEmptyOutputNames || isMerging}
          >
            <Download style={{ width: '1.25rem', height: '1.25rem' }} />
            <span>Generate & Download Merged File</span>
          </button>

          <button className="btn btn-secondary" onClick={clearAllCache}>
            <Trash2 style={{ width: '1.2rem', height: '1.2rem' }} />
            <span>Wipe App Cache</span>
          </button>

          <label className="checkbox-label" style={{ marginLeft: '0.5rem' }}>
            <input
              type="checkbox"
              className="checkbox-control"
              checked={autoClearCache}
              onChange={(e) => setAutoClearCache(e.target.checked)}
            />
            <span style={{ fontSize: '0.85rem' }}>Auto-wipe memory cache after download</span>
          </label>
        </div>
      )}

      {/* Footer / Privacy Policy */}
      <footer className="privacy-card animate-fade-in">
        <ShieldCheck className="privacy-icon" />
        <div>
          <div className="privacy-title">Local Browser Sandbox Protection</div>
          <div className="privacy-desc">
            All data parsing, key matching, dynamic remapping, and file exports are executed purely inside your local browser instance.
            Absolutely no files, credentials, or keys are uploaded to any server. Your datasets remain completely secure and private.
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
