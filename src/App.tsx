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
  Sliders,
  Plus,
  Minus,
  Layers,
  Combine,
  FilePlus,
  Check,
  HelpCircle
} from 'lucide-react';
import './App.css';

export type OperationMode = 'merge' | 'concat';

export interface ColumnConfig {
  original: string;
  output: string;
  selected: boolean;
}

export interface LoadedFile {
  id: string;
  slotIndex: number;
  name: string;
  size: number;
  format: string;
  headers: string[];
  data: any[];
  columns: ColumnConfig[];
}

export interface JoinConfig {
  secondaryFileId: string;
  targetFileId: string;
  colTarget: string;
  colSecondary: string;
  joinType: 'left' | 'right' | 'inner' | 'outer';
}

function App() {
  // Mode selection: 'merge' or 'concat'
  const [operationMode, setOperationMode] = useState<OperationMode>('merge');

  // Multi-file dynamic list state
  const [files, setFiles] = useState<LoadedFile[]>([]);
  
  // Track open file slots (min 2 slots)
  const [slotCount, setSlotCount] = useState<number>(2);
  const [dragActiveMap, setDragActiveMap] = useState<Record<number, boolean>>({});

  // File input refs mapping
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Merge Join configurations for secondary files (files[1] ... files[N-1])
  const [joinConfigs, setJoinConfigs] = useState<JoinConfig[]>([]);
  
  // Merge Matching Parameters
  const [fuzzyMatch, setFuzzyMatch] = useState(false);
  const [fuzzyThreshold, setFuzzyThreshold] = useState(0.8);
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);

  // Concat Options
  const [concatAutoAlign, setConcatAutoAlign] = useState(true);

  // Live Preview Row Limit state (10, 25, 50, 100, 250, 500, 1000)
  const [previewLimit, setPreviewLimit] = useState<number>(10);

  // Manual trigger key to re-evaluate preview engine
  const [manualRefreshKey, setManualRefreshKey] = useState<number>(0);

  const forceRefreshPreview = () => {
    setIsProcessing(true);
    setManualRefreshKey(prev => prev + 1);
    setAlert({ type: 'info', message: 'Refreshing live output preview table...' });
  };

  // Cache & Output states
  const [autoClearCache, setAutoClearCache] = useState(true);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'csv' | 'xlsx'>('csv');

  // Banner Alert
  const [alert, setAlert] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; message: string } | null>({
    type: 'info',
    message: 'Welcome to VMerge & Concat Studio. Upload two or more files to start merging or concatenating datasets.'
  });

  // Format File Size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper to sanitize headers
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

  // Add more file slot
  const addFileSlot = () => {
    setSlotCount(prev => prev + 1);
    setAlert({ type: 'info', message: `Added File Slot ${slotCount + 1}. You can now upload an additional file.` });
  };

  // Clear loaded dataset for a slot without deleting the slot card
  const clearSlotFile = (slotIndex: number) => {
    setFiles(prev => prev.filter(f => f.slotIndex !== slotIndex));
    setJoinConfigs(prev => prev.filter(jc => {
      const remainingFiles = files.filter(f => f.slotIndex !== slotIndex);
      return remainingFiles.some(f => f.id === jc.secondaryFileId);
    }));
    setAlert({ type: 'info', message: `Cleared dataset from File ${slotIndex + 1}.` });
  };

  // Remove file slot card completely (for File 3, File 4, etc. where slotIndex >= 2)
  const removeFileSlot = (slotIndex: number) => {
    if (slotCount <= 2) return;

    setFiles(prev => {
      return prev
        .filter(f => f.slotIndex !== slotIndex)
        .map(f => {
          if (f.slotIndex > slotIndex) {
            const newSlotIndex = f.slotIndex - 1;
            return {
              ...f,
              slotIndex: newSlotIndex,
              id: `file_slot_${newSlotIndex}`
            };
          }
          return f;
        });
    });

    setSlotCount(prev => prev - 1);
    setAlert({ type: 'info', message: `Deleted File ${slotIndex + 1} slot.` });
  };

  // Clear all cache and reset
  const clearAllCache = () => {
    setFiles([]);
    setJoinConfigs([]);
    setProcessedData([]);
    setSlotCount(2);
    setAlert({ type: 'success', message: 'All loaded dataset cache and memory reset successfully.' });
    Object.values(fileInputRefs.current).forEach(ref => {
      if (ref) ref.value = '';
    });
  };

  // File parsing handler
  const parseFileForSlot = (file: File, slotIndex: number) => {
    const fileType = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const rows = results.data as any[][];
          if (rows.length === 0) {
            setAlert({ type: 'error', message: `CSV file in slot ${slotIndex + 1} is empty` });
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
          
          onSlotFileParsed(file.name, file.size, 'CSV', cleanHeaders, csvData, slotIndex);
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

          onSlotFileParsed(file.name, file.size, fileType.toUpperCase(), cleanHeaders, excelData, slotIndex);
        } catch (err: any) {
          setAlert({ type: 'error', message: `Error parsing Excel: ${err.message || err}` });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setAlert({ type: 'error', message: "Unsupported file type. Please upload a CSV or Excel (.xlsx, .xls) file." });
    }
  };

  const onSlotFileParsed = (
    name: string,
    size: number,
    format: string,
    headers: string[],
    data: any[],
    slotIndex: number
  ) => {
    const fileId = `file_slot_${slotIndex}`;
    
    // Collect output names from already loaded files to prevent header collisions
    const existingOutputs = new Set<string>();
    files.forEach(f => {
      if (f.slotIndex !== slotIndex) {
        f.columns.forEach(c => {
          if (c.selected && c.output.trim()) existingOutputs.add(c.output.trim());
        });
      }
    });

    // Default column configs with automatic header disambiguation
    const columns: ColumnConfig[] = headers.map(h => {
      let outputName = h;
      if (existingOutputs.has(outputName) && slotIndex > 0) {
        outputName = `${h}_File${slotIndex + 1}`;
      }
      existingOutputs.add(outputName);
      return {
        original: h,
        output: outputName,
        selected: true
      };
    });

    const newFile: LoadedFile = {
      id: fileId,
      slotIndex,
      name,
      size,
      format,
      headers,
      data,
      columns
    };

    setFiles(prev => {
      const filtered = prev.filter(f => f.slotIndex !== slotIndex);
      const updated = [...filtered, newFile].sort((a, b) => a.slotIndex - b.slotIndex);
      return updated;
    });

    setAlert({
      type: 'success',
      message: `Successfully loaded File ${slotIndex + 1}: ${name} (${data.length} rows, ${headers.length} columns)`
    });
  };

  // Auto-fix header conflicts helper
  const autoFixHeaderConflicts = () => {
    setFiles(prevFiles => {
      const seenOutputs = new Set<string>();
      return prevFiles.map(file => {
        const updatedCols = file.columns.map(col => {
          if (!col.selected) return col;
          let outName = col.output.trim();
          if (seenOutputs.has(outName) || outName === "") {
            outName = `${col.original}_File${file.slotIndex + 1}`;
            if (seenOutputs.has(outName)) {
              outName = `${outName}_${Date.now().toString().slice(-4)}`;
            }
          }
          seenOutputs.add(outName);
          return { ...col, output: outName };
        });
        return { ...file, columns: updatedCols };
      });
    });
    setAlert({ type: 'success', message: 'Header conflicts automatically resolved!' });
  };



  // Smart Key Matcher for multi-table relational join
  const findBestKeyMatch = (secFile: LoadedFile, availableTargetFiles: LoadedFile[]) => {
    if (availableTargetFiles.length === 0) {
      return { targetFileId: '', colTarget: '', colSecondary: secFile.headers[0] || '' };
    }

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Exact case-insensitive match
    for (const targetFile of availableTargetFiles) {
      for (const targetHeader of targetFile.headers) {
        for (const secHeader of secFile.headers) {
          if (targetHeader.toLowerCase().trim() === secHeader.toLowerCase().trim()) {
            return {
              targetFileId: targetFile.id,
              colTarget: targetHeader,
              colSecondary: secHeader
            };
          }
        }
      }
    }

    // 2. Normalized match (ignoring '_', '-', spaces)
    for (const targetFile of availableTargetFiles) {
      for (const targetHeader of targetFile.headers) {
        for (const secHeader of secFile.headers) {
          if (normalize(targetHeader) === normalize(secHeader) && normalize(targetHeader).length > 1) {
            return {
              targetFileId: targetFile.id,
              colTarget: targetHeader,
              colSecondary: secHeader
            };
          }
        }
      }
    }

    // 3. Fallback to preceding file with first headers
    const fallbackTarget = availableTargetFiles[availableTargetFiles.length - 1] || availableTargetFiles[0];
    return {
      targetFileId: fallbackTarget.id,
      colTarget: fallbackTarget.headers[0] || '',
      colSecondary: secFile.headers[0] || ''
    };
  };

  const autoDetectKeyForSecondaryFile = (secFileId: string) => {
    const secFile = files.find(f => f.id === secFileId);
    if (!secFile) return;

    const availableTargets = files.filter(f => f.id !== secFileId);
    const bestMatch = findBestKeyMatch(secFile, availableTargets);

    setJoinConfigs(prev => prev.map(jc => jc.secondaryFileId === secFileId ? {
      ...jc,
      targetFileId: bestMatch.targetFileId,
      colTarget: bestMatch.colTarget,
      colSecondary: bestMatch.colSecondary
    } : jc));

    const targetFile = files.find(f => f.id === bestMatch.targetFileId);
    setAlert({
      type: 'success',
      message: `Auto-detected key mapping for ${secFile.name}: Connected to ${targetFile?.name || 'Base File'} on (${bestMatch.colTarget} 🔗 ${bestMatch.colSecondary}).`
    });
  };

  // Sync Join Configs whenever loaded files list changes
  useEffect(() => {
    if (files.length < 2) {
      setJoinConfigs([]);
      return;
    }

    setJoinConfigs(prevConfigs => {
      const updatedConfigs: JoinConfig[] = [];

      for (let i = 1; i < files.length; i++) {
        const secFile = files[i];
        const existing = prevConfigs.find(c => c.secondaryFileId === secFile.id);

        if (existing && files.some(f => f.id === existing.targetFileId)) {
          updatedConfigs.push(existing);
        } else {
          // Auto-detect best match key with preceding files
          const availableTargets = files.slice(0, i);
          const bestMatch = findBestKeyMatch(secFile, availableTargets);

          updatedConfigs.push({
            secondaryFileId: secFile.id,
            targetFileId: bestMatch.targetFileId,
            colTarget: bestMatch.colTarget,
            colSecondary: bestMatch.colSecondary,
            joinType: 'left'
          });
        }
      }

      return updatedConfigs;
    });
  }, [files]);

  // Batch parse multiple dropped or selected files starting at startSlotIndex
  const batchParseFiles = (fileList: File[], startSlotIndex: number = 0) => {
    if (!fileList || fileList.length === 0) return;

    // Filter to supported file formats
    const validFiles = fileList.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'csv' || ext === 'xlsx' || ext === 'xls';
    });

    if (validFiles.length === 0) {
      setAlert({ type: 'error', message: 'No supported CSV or Excel files found in selection.' });
      return;
    }

    // Expand slotCount dynamically if total files exceed current slots
    const totalNeededSlots = startSlotIndex + validFiles.length;
    setSlotCount(prev => Math.max(prev, totalNeededSlots));

    // Parse each valid file for its consecutive slot
    validFiles.forEach((file, index) => {
      const targetSlot = startSlotIndex + index;
      parseFileForSlot(file, targetSlot);
    });

    setAlert({
      type: 'success',
      message: `Batch loading ${validFiles.length} file(s): Auto-assigned to File ${startSlotIndex + 1} through File ${startSlotIndex + validFiles.length}.`
    });
  };

  // Drag and Drop handlers per slot
  const handleDrag = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveMap(prev => ({ ...prev, [slotIndex]: true }));
    } else if (e.type === "dragleave") {
      setDragActiveMap(prev => ({ ...prev, [slotIndex]: false }));
    }
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveMap(prev => ({ ...prev, [slotIndex]: false }));

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      batchParseFiles(droppedFiles, slotIndex);
    }
  };

  // Column config update helpers
  const updateColumnConfig = (fileId: string, colIndex: number, key: keyof ColumnConfig, value: any) => {
    setFiles(prevFiles => prevFiles.map(file => {
      if (file.id !== fileId) return file;
      const nextCols = [...file.columns];
      nextCols[colIndex] = { ...nextCols[colIndex], [key]: value };
      return { ...file, columns: nextCols };
    }));
  };

  const selectAllColumnsForFile = (fileId: string, status: boolean) => {
    setFiles(prevFiles => prevFiles.map(file => {
      if (file.id !== fileId) return file;
      const nextCols = file.columns.map(c => ({ ...c, selected: status }));
      return { ...file, columns: nextCols };
    }));
  };

  const selectAllColumnsGlobal = (status: boolean) => {
    setFiles(prevFiles => prevFiles.map(file => ({
      ...file,
      columns: file.columns.map(c => ({ ...c, selected: status }))
    })));
  };

  // Similarity Levenshtein for fuzzy join
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

  // Check duplicate output names within Merge mode
  const duplicateOutputNames = useMemo(() => {
    if (operationMode === 'concat') return new Set<string>();

    const names = new Set<string>();
    const duplicates = new Set<string>();

    files.forEach(file => {
      file.columns.forEach(c => {
        if (c.selected) {
          if (names.has(c.output)) duplicates.add(c.output);
          else names.add(c.output);
        }
      });
    });

    return duplicates;
  }, [files, operationMode]);

  // Check empty output column names
  const hasEmptyOutputNames = useMemo(() => {
    return files.some(file => file.columns.some(c => c.selected && c.output.trim() === ""));
  }, [files]);

  // Auto-align Concat column names when option toggled
  useEffect(() => {
    if (operationMode === 'concat' && concatAutoAlign) {
      setFiles(prevFiles => prevFiles.map(file => {
        const updatedCols = file.columns.map(c => ({
          ...c,
          output: c.original // restore original header name for seamless alignment
        }));
        return { ...file, columns: updatedCols };
      }));
    }
  }, [operationMode, concatAutoAlign]);

  // Core Processing Engine (Merge vs Concat) inside debounced Effect
  useEffect(() => {
    if (files.length === 0) {
      setProcessedData([]);
      return;
    }

    setIsProcessing(true);

    const timer = setTimeout(() => {
      try {
        if (operationMode === 'concat') {
          // --- CONCAT MODE ENGINE ---
          // Stack rows across all loaded files
          const allOutputHeadersSet = new Set<string>();
          files.forEach(file => {
            file.columns.forEach(col => {
              if (col.selected && col.output.trim() !== '') {
                allOutputHeadersSet.add(col.output.trim());
              }
            });
          });

          const outputHeaders = Array.from(allOutputHeadersSet);
          const concatenatedResult: any[] = [];

          files.forEach(file => {
            const activeCols = file.columns.filter(c => c.selected && c.output.trim() !== '');
            file.data.forEach(row => {
              const rowObj: any = {};
              // Fill all headers with default empty string
              outputHeaders.forEach(h => { rowObj[h] = ""; });
              
              // Populate values for selected columns in this file
              activeCols.forEach(c => {
                const val = row[c.original];
                rowObj[c.output.trim()] = val !== undefined && val !== null ? val : "";
              });
              concatenatedResult.push(rowObj);
            });
          });

          setProcessedData(concatenatedResult);
          setAlert(null);

        } else {
          // --- MERGE MODE ENGINE ---
          if (files.length < 2) {
            setProcessedData([]);
            setIsProcessing(false);
            return;
          }

          // Primary file is base slot 0 file (or first available loaded file)
          const primaryFile = files.find(f => f.slotIndex === 0) || files[0];
          const activeColsPrimary = primaryFile.columns
            .filter(c => c.selected)
            .map(c => ({ original: c.original, output: c.output }));

          // Helper key sanitizer
          const getKeyVal = (row: any, col: string) => {
            if (!row) return "";
            let val = row[col];
            if (val === undefined || val === null) return "";
            val = String(val);
            if (trimWhitespace) val = val.trim();
            if (caseInsensitive) val = val.toLowerCase();
            return val;
          };

          // Topological sort of joinConfigs to resolve dependencies cleanly
          const orderedConfigs: JoinConfig[] = [];
          const joinedFileIds = new Set<string>([primaryFile.id]);
          const remainingConfigs = joinConfigs.filter(jc => files.some(f => f.id === jc.secondaryFileId));

          while (remainingConfigs.length > 0) {
            let progressMade = false;

            for (let i = 0; i < remainingConfigs.length; i++) {
              const config = remainingConfigs[i];
              if (joinedFileIds.has(config.targetFileId) || !files.some(f => f.id === config.targetFileId)) {
                orderedConfigs.push(config);
                joinedFileIds.add(config.secondaryFileId);
                remainingConfigs.splice(i, 1);
                progressMade = true;
                break;
              }
            }

            if (!progressMade) {
              orderedConfigs.push(...remainingConfigs);
              break;
            }
          }

          // Sequential multi-file join starting with Primary dataset
          let currentDataSet: any[] = primaryFile.data.map(row => {
            const baseRow: any = {};
            activeColsPrimary.forEach(c => {
              baseRow[c.output] = row[c.original] !== undefined ? row[c.original] : "";
            });
            baseRow['_raw_data_' + primaryFile.id] = row;
            return baseRow;
          });

          // Join each secondary file according to topological order
          for (let i = 0; i < orderedConfigs.length; i++) {
            const jc = orderedConfigs[i];
            const secFile = files.find(f => f.id === jc.secondaryFileId);
            if (!secFile) continue;

            const targetFile = files.find(f => f.id === jc.targetFileId) || primaryFile;
            const activeColsSec = secFile.columns
              .filter(c => c.selected)
              .map(c => ({ original: c.original, output: c.output }));

            const nextMergedResult: any[] = [];
            const matchedSecRows = new Set<any>();

            if (!fuzzyMatch) {
              // Index Hash Map Join
              const indexSec = new Map<string, any[]>();
              secFile.data.forEach(rowSec => {
                const keySec = getKeyVal(rowSec, jc.colSecondary);
                if (!indexSec.has(keySec)) indexSec.set(keySec, []);
                indexSec.get(keySec)!.push(rowSec);
              });

              currentDataSet.forEach(rowCurr => {
                const rawTargetRow = rowCurr['_raw_data_' + targetFile.id];
                const keyTarget = rawTargetRow ? getKeyVal(rawTargetRow, jc.colTarget) : "";

                const matchesSec = indexSec.get(keyTarget);

                if (matchesSec && matchesSec.length > 0) {
                  matchesSec.forEach(rowSec => {
                    matchedSecRows.add(rowSec);
                    const mergedRow = { ...rowCurr };
                    activeColsSec.forEach(c => {
                      mergedRow[c.output] = rowSec[c.original] !== undefined ? rowSec[c.original] : "";
                    });
                    mergedRow['_raw_data_' + secFile.id] = rowSec;
                    nextMergedResult.push(mergedRow);
                  });
                } else {
                  if (jc.joinType === 'left' || jc.joinType === 'outer') {
                    const mergedRow = { ...rowCurr };
                    activeColsSec.forEach(c => {
                      mergedRow[c.output] = "";
                    });
                    nextMergedResult.push(mergedRow);
                  }
                }
              });

              if (jc.joinType === 'right' || jc.joinType === 'outer') {
                secFile.data.forEach(rowSec => {
                  if (!matchedSecRows.has(rowSec)) {
                    const mergedRow: any = {};
                    // Fill dummy blank values for previous columns with null safety
                    if (currentDataSet.length > 0) {
                      Object.keys(currentDataSet[0]).forEach(k => {
                        if (!k.startsWith('_raw_data_')) mergedRow[k] = "";
                      });
                    } else {
                      files.forEach(f => {
                        if (f.id !== secFile.id) {
                          f.columns.forEach(c => {
                            if (c.selected) mergedRow[c.output] = "";
                          });
                        }
                      });
                    }
                    activeColsSec.forEach(c => {
                      mergedRow[c.output] = rowSec[c.original] !== undefined ? rowSec[c.original] : "";
                    });
                    mergedRow['_raw_data_' + secFile.id] = rowSec;
                    nextMergedResult.push(mergedRow);
                  }
                });
              }
            } else {
              // Fuzzy Join with Levenshtein
              currentDataSet.forEach(rowCurr => {
                const rawTargetRow = rowCurr['_raw_data_' + targetFile.id];
                const keyTarget = rawTargetRow ? getKeyVal(rawTargetRow, jc.colTarget) : "";
                let hasMatchedSec = false;

                secFile.data.forEach(rowSec => {
                  const keySec = getKeyVal(rowSec, jc.colSecondary);
                  const sim = getSimilarity(keyTarget, keySec);

                  if (sim >= fuzzyThreshold) {
                    hasMatchedSec = true;
                    matchedSecRows.add(rowSec);
                    const mergedRow = { ...rowCurr };
                    activeColsSec.forEach(c => {
                      mergedRow[c.output] = rowSec[c.original] !== undefined ? rowSec[c.original] : "";
                    });
                    mergedRow['_raw_data_' + secFile.id] = rowSec;
                    nextMergedResult.push(mergedRow);
                  }
                });

                if (!hasMatchedSec && (jc.joinType === 'left' || jc.joinType === 'outer')) {
                  const mergedRow = { ...rowCurr };
                  activeColsSec.forEach(c => {
                    mergedRow[c.output] = "";
                  });
                  nextMergedResult.push(mergedRow);
                }
              });

              if (jc.joinType === 'right' || jc.joinType === 'outer') {
                secFile.data.forEach(rowSec => {
                  if (!matchedSecRows.has(rowSec)) {
                    const mergedRow: any = {};
                    if (currentDataSet.length > 0) {
                      Object.keys(currentDataSet[0]).forEach(k => {
                        if (!k.startsWith('_raw_data_')) mergedRow[k] = "";
                      });
                    } else {
                      files.forEach(f => {
                        if (f.id !== secFile.id) {
                          f.columns.forEach(c => {
                            if (c.selected) mergedRow[c.output] = "";
                          });
                        }
                      });
                    }
                    activeColsSec.forEach(c => {
                      mergedRow[c.output] = rowSec[c.original] !== undefined ? rowSec[c.original] : "";
                    });
                    mergedRow['_raw_data_' + secFile.id] = rowSec;
                    nextMergedResult.push(mergedRow);
                  }
                });
              }
            }

            currentDataSet = nextMergedResult;
          }

          // Clean up internal raw data references before presenting
          const cleanedDataSet = currentDataSet.map(row => {
            const cleanObj: any = {};
            Object.keys(row).forEach(k => {
              if (!k.startsWith('_raw_data_')) {
                cleanObj[k] = row[k];
              }
            });
            return cleanObj;
          });

          setProcessedData(cleanedDataSet);

          if (duplicateOutputNames.size > 0) {
            setAlert({
              type: 'warning',
              message: `Header Conflict Warning: Dual output mapping for: [${Array.from(duplicateOutputNames).join(', ')}]. Rename conflicting headers to prevent data overwrites.`
            });
          } else if (hasEmptyOutputNames) {
            setAlert({
              type: 'warning',
              message: 'Empty Header Warning: One or more selected columns have blank names. Please enter a valid header name.'
            });
          } else {
            setAlert(null);
          }
        }
      } catch (err: any) {
        setAlert({ type: 'error', message: `Processing Engine Failure: ${err.message}` });
      } finally {
        setIsProcessing(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [
    files,
    operationMode,
    joinConfigs,
    caseInsensitive,
    trimWhitespace,
    fuzzyMatch,
    fuzzyThreshold,
    duplicateOutputNames,
    hasEmptyOutputNames,
    manualRefreshKey
  ]);

  // Export File & Download Handler
  const downloadProcessedFile = () => {
    if (processedData.length === 0) {
      setAlert({ type: 'error', message: "Nothing to download. Please verify your datasets and configuration." });
      return;
    }

    if (operationMode === 'merge' && duplicateOutputNames.size > 0) {
      setAlert({ type: 'error', message: "Cannot export with duplicate output column names. Please rename conflicting headers first." });
      return;
    }

    if (hasEmptyOutputNames) {
      setAlert({ type: 'error', message: "Cannot export with blank output column names. Please rename or deselect them." });
      return;
    }

    try {
      const modeLabel = operationMode === 'merge' ? 'merged' : 'concatenated';
      const filename = `${modeLabel}_export_${Date.now()}.${outputFormat}`;

      if (outputFormat === 'csv') {
        const csvContent = Papa.unparse(processedData);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(processedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, operationMode === 'merge' ? "Merged Data" : "Concatenated Data");
        XLSX.writeFile(workbook, filename);
      }

      setAlert({
        type: 'success',
        message: `Success! Exported ${processedData.length} records. File downloaded as: ${filename}`
      });

      if (autoClearCache) {
        setTimeout(() => {
          clearAllCache();
          setAlert({
            type: 'success',
            message: `Export completed! Memory cache cleared automatically for maximum security.`
          });
        }, 2000);
      }
    } catch (err: any) {
      setAlert({ type: 'error', message: `Export engine encountered an error: ${err.message}` });
    }
  };

  // Dynamic preview range slice (capped at safe max 1,000 rows to preserve browser DOM performance)
  const previewRows = useMemo(() => {
    const safeLimit = Math.min(previewLimit, 1000);
    return processedData.slice(0, safeLimit);
  }, [processedData, previewLimit]);

  // Headers for preview
  const previewHeaders = useMemo(() => {
    if (processedData.length === 0) return [];
    return Object.keys(processedData[0]);
  }, [processedData]);

  // Generate slots array for rendering
  const slotsArray = Array.from({ length: slotCount }, (_, i) => i);

  // Helper to explain disabled state for download button
  const getDisabledReason = (): string | null => {
    if (files.length === 0) return "Upload at least one dataset to begin.";
    if (isProcessing) return "Updating dataset calculations...";
    if (operationMode === 'merge' && files.length < 2) return "Upload at least 2 datasets for relational merge.";
    if (operationMode === 'merge' && duplicateOutputNames.size > 0) {
      return `Duplicate output headers: [${Array.from(duplicateOutputNames).join(', ')}]. Click 🪄 Auto-Fix to resolve.`;
    }
    if (hasEmptyOutputNames) return "One or more selected output column headers are empty.";
    if (processedData.length === 0) return "0 matching rows produced. Check your join key selections or join strategy.";
    return null;
  };

  return (
    <>
      {/* Header Section */}
      <header className="header animate-fade-in">
        <div className="logo-container">
          <Shuffle className="logo-icon" />
          <h1>VMerge & Concat Studio</h1>
        </div>
        <p>Local-First CSV & Excel Dynamic Joining & Concatenation Engine</p>

        {/* Operation Mode Selector Bar */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <div className="mode-toggle-container">
            <button
              className={`mode-toggle-btn ${operationMode === 'merge' ? 'active' : ''}`}
              onClick={() => setOperationMode('merge')}
            >
              <Combine style={{ width: '1.1rem', height: '1.1rem' }} />
              <span>Merge Mode (Relational Join)</span>
            </button>
            <button
              className={`mode-toggle-btn ${operationMode === 'concat' ? 'active' : ''}`}
              onClick={() => setOperationMode('concat')}
            >
              <Layers style={{ width: '1.1rem', height: '1.1rem' }} />
              <span>Concat Mode (Row Stacking)</span>
            </button>
          </div>
        </div>
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

      {/* Main Grid: Multi-File Upload Cards */}
      <main className="upload-grid-dynamic animate-fade-in">
        {slotsArray.map((slotIndex) => {
          const loadedFile = files.find(f => f.slotIndex === slotIndex);

          return (
            <section key={slotIndex} className="glass-card upload-card">
              <div className="card-title">
                <div className="card-title-text">
                  <FileSpreadsheet />
                  <span>
                    {slotIndex === 0
                      ? 'File 1 (Primary Base)'
                      : `File ${slotIndex + 1} ${operationMode === 'merge' ? '(Lookup Dataset)' : '(Dataset)'}`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {loadedFile && (
                    <span className="badge badge-primary">{loadedFile.format}</span>
                  )}
                  {slotIndex >= 2 && (
                    <button
                      className="btn-remove-slot"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFileSlot(slotIndex);
                      }}
                      title={`Remove File ${slotIndex + 1} slot`}
                      aria-label={`Remove File ${slotIndex + 1} slot`}
                    >
                      <Minus style={{ width: '0.85rem', height: '0.85rem', strokeWidth: 2.5 }} />
                    </button>
                  )}
                </div>
              </div>

              {!loadedFile ? (
                <div
                  className={`drop-zone ${dragActiveMap[slotIndex] ? 'active' : ''}`}
                  onDragEnter={(e) => handleDrag(e, slotIndex)}
                  onDragOver={(e) => handleDrag(e, slotIndex)}
                  onDragLeave={(e) => handleDrag(e, slotIndex)}
                  onDrop={(e) => handleDrop(e, slotIndex)}
                  onClick={() => fileInputRefs.current[slotIndex]?.click()}
                >
                  <input
                    ref={(el) => (fileInputRefs.current[slotIndex] = el)}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        batchParseFiles(Array.from(e.target.files), slotIndex);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <UploadCloud className="drop-icon" />
                  <p>Drag & drop File {slotIndex + 1} (or multiple files) here</p>
                  <span>Supports single or batch upload of .csv, .xlsx, .xls</span>
                </div>
              ) : (
                <div className="file-details">
                  <div className="file-header">
                    <FileSpreadsheet className="file-icon" />
                    <div className="file-meta">
                      <div className="file-name" title={loadedFile.name}>{loadedFile.name}</div>
                      <div className="file-size">{formatBytes(loadedFile.size)}</div>
                    </div>
                    <button
                      className="btn btn-secondary btn-danger"
                      style={{ padding: '0.45rem' }}
                      onClick={() => clearSlotFile(slotIndex)}
                      title="Clear loaded dataset"
                    >
                      <Trash2 style={{ width: '1.1rem', height: '1.1rem' }} />
                    </button>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-label">Total Rows</div>
                      <div className="stat-value">{loadedFile.data.length}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Columns</div>
                      <div className="stat-value">{loadedFile.headers.length}</div>
                    </div>
                  </div>

                  <div className="column-list-preview">
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Headers Preview:
                    </div>
                    <div className="column-chips">
                      {loadedFile.headers.map((h, i) => (
                        <span key={i} className="column-chip">{h}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {/* Plus Button Card to Add More Files */}
        <div className="glass-card add-file-card" onClick={addFileSlot}>
          <div className="add-file-inner">
            <div className="add-file-icon-wrap">
              <Plus className="add-file-icon" />
            </div>
            <span className="add-file-title">+ Add Another File</span>
            <span className="add-file-desc">Click to insert File {slotCount + 1} slot to join or concatenate</span>
          </div>
        </div>
      </main>

      {/* Mode-Specific Settings & Configuration Section */}
      {files.length > 0 && (
        <section className="glass-card config-section animate-fade-in">
          
          {/* Mode Header */}
          <div className="section-header">
            {operationMode === 'merge' ? (
              <>
                <Settings className="section-icon" />
                <h2 className="section-title">Configure Relational Join (Merge)</h2>
              </>
            ) : (
              <>
                <Layers className="section-icon" />
                <h2 className="section-title">Configure Row Concatenation</h2>
              </>
            )}
          </div>

          {/* MERGE MODE CONFIGURATIONS */}
          {operationMode === 'merge' && (
            <>
              {files.length < 2 ? (
                <div className="alert-banner info" style={{ marginBottom: '1.5rem' }}>
                  <Info className="alert-banner-icon" />
                  <span>Upload at least two files above to configure match keys and perform a relational join.</span>
                </div>
              ) : (
                <>
                  {/* Relational Join Flow Pipeline Diagram */}
                  <div className="relational-pipeline-banner">
                    <div className="pipeline-title">Live Relational Joining Chain Diagram:</div>
                    <div className="pipeline-nodes">
                      <div className="pipeline-node primary">
                        <span className="node-badge">Primary Base</span>
                        <span className="node-name" title={files[0].name}>{files[0].name}</span>
                      </div>
                      {joinConfigs.map((jc, idx) => {
                        const secFile = files.find(f => f.id === jc.secondaryFileId);
                        const targetFile = files.find(f => f.id === jc.targetFileId);
                        if (!secFile || !targetFile) return null;

                        return (
                          <React.Fragment key={jc.secondaryFileId}>
                            <div className="pipeline-arrow">
                              <span className="arrow-label" title={`${targetFile.name} (${jc.colTarget}) = ${secFile.name} (${jc.colSecondary})`}>
                                {jc.colTarget} 🔗 {jc.colSecondary} ({jc.joinType})
                              </span>
                              <div className="arrow-line">➔</div>
                            </div>
                            <div className="pipeline-node">
                              <span className="node-badge">Join #{idx + 1}</span>
                              <span className="node-name" title={secFile.name}>{secFile.name}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      Multi-Dataset Relational Key Mapping
                    </label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Link each secondary dataset to any preceding table and choose matching key columns.
                    </p>

                    <div className="join-configs-container">
                      {joinConfigs.map((jc, index) => {
                        const secFile = files.find(f => f.id === jc.secondaryFileId);
                        const targetFile = files.find(f => f.id === jc.targetFileId) || files[0];
                        if (!secFile) return null;

                        return (
                          <div key={jc.secondaryFileId} className="join-key-row-card">
                            <div className="join-row-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="badge badge-primary">Join #{index + 1}: {secFile.name}</span>
                              <button
                                className="btn btn-secondary btn-xs"
                                style={{ color: 'var(--primary-hover)', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                                onClick={() => autoDetectKeyForSecondaryFile(secFile.id)}
                                title="Auto-detect best matching column names"
                              >
                                ⚡ Auto-Detect Key
                              </button>
                            </div>

                            <div className="join-row-controls-grid">
                              {/* Step 1: Select Target File */}
                              <div className="join-step-control">
                                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                                  1. Connect To Table
                                </label>
                                <select
                                  className="select-control"
                                  value={jc.targetFileId}
                                  onChange={(e) => {
                                    const newTargetId = e.target.value;
                                    const newTargetFile = files.find(f => f.id === newTargetId) || files[0];
                                    const autoMatch = findBestKeyMatch(secFile, [newTargetFile]);
                                    setJoinConfigs(prev => prev.map(c => c.secondaryFileId === jc.secondaryFileId ? {
                                      ...c,
                                      targetFileId: newTargetId,
                                      colTarget: autoMatch.colTarget,
                                      colSecondary: autoMatch.colSecondary
                                    } : c));
                                  }}
                                >
                                  {files.filter(f => f.id !== secFile.id).map(f => (
                                    <option key={f.id} value={f.id}>
                                      File {f.slotIndex + 1}: {f.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Step 2: Select Column in Target File */}
                              <div className="join-step-control">
                                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                                  2. Column in File {targetFile.slotIndex + 1} ({targetFile.name})
                                </label>
                                <select
                                  className="select-control"
                                  value={jc.colTarget}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setJoinConfigs(prev => prev.map(c => c.secondaryFileId === jc.secondaryFileId ? {
                                      ...c,
                                      colTarget: val
                                    } : c));
                                  }}
                                >
                                  {targetFile.headers.map((h, i) => (
                                    <option key={i} value={h}>{h}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Step 3: Select Column in Current Secondary File */}
                              <div className="join-step-control">
                                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                                  3. Column in File {secFile.slotIndex + 1} ({secFile.name})
                                </label>
                                <select
                                  className="select-control"
                                  value={jc.colSecondary}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setJoinConfigs(prev => prev.map(c => c.secondaryFileId === jc.secondaryFileId ? {
                                      ...c,
                                      colSecondary: val
                                    } : c));
                                  }}
                                >
                                  {secFile.headers.map((h, i) => (
                                    <option key={i} value={h}>{h}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Step 4: Select Join Strategy */}
                              <div className="join-step-control">
                                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                                  4. Relational Strategy
                                </label>
                                <select
                                  className="select-control"
                                  value={jc.joinType}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setJoinConfigs(prev => prev.map(c => c.secondaryFileId === jc.secondaryFileId ? {
                                      ...c,
                                      joinType: val
                                    } : c));
                                  }}
                                >
                                  <option value="left">Left Join (VLookup standard)</option>
                                  <option value="inner">Inner Join (Matched only)</option>
                                  <option value="right">Right Join (All secondary)</option>
                                  <option value="outer">Full Outer Join</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Matching Options Panel */}
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

                  {/* Fuzzy Slider */}
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
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* CONCAT MODE CONFIGURATIONS */}
          {operationMode === 'concat' && (
            <div className="options-panel" style={{ marginBottom: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-control"
                  checked={concatAutoAlign}
                  onChange={(e) => setConcatAutoAlign(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: 'var(--primary-hover)' }}>
                  Auto-Align Identical Header Names Across Files
                </span>
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', width: '100%', marginTop: '-0.5rem' }}>
                When checked, columns with matching original names across uploaded files will be combined into unified output columns automatically.
              </span>
            </div>
          )}

          {/* DYNAMIC FIELD SELECTION & SCHEMA MAPPER FOR ALL FILES */}
          <div className="section-header" style={{ borderBottom: 'none', marginBottom: '0.5rem', marginTop: '1rem', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Sliders className="section-icon" />
              <h2 className="section-title">Select Columns & Map Output Schema</h2>
            </div>
            {files.length > 0 && (
              <div className="quick-actions" style={{ gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-xs" style={{ padding: '0.35rem 0.65rem' }} onClick={() => selectAllColumnsGlobal(true)}>
                  Select All (All Files)
                </button>
                <button className="btn btn-secondary btn-xs" style={{ padding: '0.35rem 0.65rem' }} onClick={() => selectAllColumnsGlobal(false)}>
                  Deselect All (All Files)
                </button>
              </div>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            Choose which columns to include from each file and specify their target header names for the export.
          </p>

          <div className="schema-grid-multi">
            {files.map((file) => (
              <div key={file.id} className="glass-card schema-column-card" style={{ background: 'rgba(0, 0, 0, 0.1)' }}>
                <div className="schema-headers-bar">
                  <span className="schema-file-title" title={`File ${file.slotIndex + 1}: ${file.name}`}>
                    File {file.slotIndex + 1}: {file.name}
                  </span>
                  <div className="quick-actions">
                    <button className="btn btn-secondary btn-xs" onClick={() => selectAllColumnsForFile(file.id, true)}>Select All</button>
                    <button className="btn btn-secondary btn-xs" onClick={() => selectAllColumnsForFile(file.id, false)}>Deselect All</button>
                  </div>
                </div>

                <div className="schema-list">
                  {file.columns.map((col, cIndex) => {
                    const isConflict = duplicateOutputNames.has(col.output) && col.selected;
                    return (
                      <div
                        key={cIndex}
                        className={`schema-item ${col.selected ? 'selected' : ''} ${isConflict ? 'conflict-warning' : ''}`}
                        onClick={() => updateColumnConfig(file.id, cIndex, 'selected', !col.selected)}
                        style={{ cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          className="checkbox-control"
                          checked={col.selected}
                          onChange={(e) => updateColumnConfig(file.id, cIndex, 'selected', e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="schema-col-info">
                          <div className="schema-col-name" title={col.original}>
                            {col.original}
                          </div>
                        </div>
                        {col.selected && (
                          <input
                            type="text"
                            className="schema-rename-input"
                            value={col.output}
                            placeholder="Output Header..."
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateColumnConfig(file.id, cIndex, 'output', e.target.value)}
                            title="Dynamic column rename"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </section>
      )}

      {/* Live Preview Section */}
      {files.length > 0 && (
        <section className="glass-card preview-section animate-fade-in">
          <div className="section-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Eye className="section-icon" />
              <h2 className="section-title">
                Live Output Preview ({operationMode === 'merge' ? 'Merge' : 'Concat'})
                {isProcessing && (
                  <RefreshCw className="spinner" style={{ marginLeft: '0.75rem', width: '1rem', height: '1rem', color: 'var(--primary)' }} />
                )}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-xs"
                style={{ padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary-hover)', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                onClick={forceRefreshPreview}
                disabled={isProcessing}
                title="Manually re-calculate and refresh live output preview table"
              >
                <RefreshCw className={isProcessing ? "spinner" : ""} style={{ width: '0.85rem', height: '0.85rem' }} />
                <span>Refresh Table</span>
              </button>

              {processedData.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Preview Range:
                  </label>
                  <select
                    className="select-control"
                    style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.8rem', height: 'auto', borderRadius: 'var(--radius-sm)' }}
                    value={previewLimit}
                    onChange={(e) => setPreviewLimit(Number(e.target.value))}
                  >
                    <option value={10}>Top 10 rows</option>
                    <option value={25}>Top 25 rows</option>
                    <option value={50}>Top 50 rows</option>
                    <option value={100}>Top 100 rows</option>
                    <option value={250}>Top 250 rows</option>
                    <option value={500}>Top 500 rows</option>
                    <option value={1000}>Top 1,000 rows (Max Preview)</option>
                  </select>
                </div>
              )}

              {processedData.length > 0 && (
                <span className="badge badge-success">
                  {processedData.length.toLocaleString()} records processed
                </span>
              )}
            </div>
          </div>

          <div className="table-wrapper">
            {processedData.length > 0 ? (
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
                {isProcessing ? 'Processing datasets...' : 'No processed rows available. Check uploaded files and key selections.'}
              </div>
            )}
          </div>
          {processedData.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.5rem' }}>
              Showing {previewRows.length} of {processedData.length.toLocaleString()} total processed records (Preview capped at max 1,000 rows to safeguard browser DOM performance).
            </div>
          )}
        </section>
      )}

      {/* Actions & Export Panel */}
      {files.length > 0 && (
        <div className="actions-panel animate-fade-in" style={{ flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
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
              onClick={downloadProcessedFile}
              disabled={processedData.length === 0 || duplicateOutputNames.size > 0 || hasEmptyOutputNames || isProcessing}
            >
              <Download style={{ width: '1.25rem', height: '1.25rem' }} />
              <span>Generate & Download {operationMode === 'merge' ? 'Merged' : 'Concatenated'} File</span>
            </button>

            {duplicateOutputNames.size > 0 && (
              <button
                className="btn btn-secondary"
                style={{ color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.1)' }}
                onClick={autoFixHeaderConflicts}
                title="Auto-fix conflicting header names"
              >
                🪄 Auto-Fix Header Conflicts
              </button>
            )}

            <button className="btn btn-secondary" onClick={clearAllCache}>
              <Trash2 style={{ width: '1.2rem', height: '1.2rem' }} />
              <span>Wipe App Cache</span>
            </button>
          </div>

          {getDisabledReason() && (
            <div className="alert-banner warning" style={{ margin: 0, padding: '0.65rem 1rem', fontSize: '0.825rem' }}>
              <AlertCircle className="alert-banner-icon" style={{ width: '1.1rem', height: '1.1rem' }} />
              <span>{getDisabledReason()}</span>
            </div>
          )}

          <label className="checkbox-label">
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

      {/* Local Privacy Guarantee */}
      <footer className="privacy-card animate-fade-in">
        <ShieldCheck className="privacy-icon" />
        <div>
          <div className="privacy-title">Local Browser Sandbox Protection</div>
          <div className="privacy-desc">
            All file uploads, row concatenation, key merging, field remapping, and file generation run 100% locally in your web browser. No data is sent to external servers.
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
