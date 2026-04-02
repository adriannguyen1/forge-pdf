import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../stores/useAppStore';
import { storeFileBytes } from '../stores/fileStore';
import { getPdfMetadata } from '../services/pdfUtils';
import { convertImageToPdf } from '../services/imageConverter';
import { getApiBase } from '../utils/api';

export default function FileUpload() {
  const addFile = useAppStore((s) => s.addFile);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isPdf = ext === 'pdf';
      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      const needsServer = ['docx', 'doc', 'pptx', 'ppt', 'html', 'htm'].includes(ext);

      setUploading(true);
      try {
        if (isPdf) {
          const fileId = uuidv4();
          const arrayBuffer = await file.arrayBuffer();
          storeFileBytes(fileId, arrayBuffer);
          const { pageCount } = await getPdfMetadata(arrayBuffer);
          addFile({ id: fileId, fileName: file.name, pageCount });
          toast.success(`Loaded ${file.name} (${pageCount} pages)`);
        } else if (isImage) {
          const fileId = uuidv4();
          const arrayBuffer = await file.arrayBuffer();
          const { pdfBytes, pageCount } = await convertImageToPdf(arrayBuffer, file.type);
          storeFileBytes(fileId, pdfBytes);
          addFile({ id: fileId, fileName: file.name, pageCount });
          toast.success(`Loaded ${file.name} (${pageCount} pages)`);
        } else if (needsServer) {
          const formData = new FormData();
          formData.append('file', file);
          const { data } = await axios.post(`${getApiBase()}/api/upload`, formData);
          // Fetch the converted PDF bytes back so all files live in the local store
          const pdfResp = await axios.get(`${getApiBase()}/api/files/${data.fileId}/pdf`, { responseType: 'arraybuffer' });
          storeFileBytes(data.fileId, pdfResp.data);
          addFile({ id: data.fileId, fileName: data.fileName, pageCount: data.pageCount });
          toast.success(`Uploaded ${data.fileName} (${data.pageCount} pages)`);
        } else {
          toast.error(`Unsupported file type: .${ext}`);
        }
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Upload failed';
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [addFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      files.forEach(upload);
    },
    [upload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(upload);
      e.target.value = '';
    },
    [upload]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.html,.htm"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      {uploading ? (
        <p className="text-sm text-gray-400">Uploading...</p>
      ) : (
        <>
          <p className="text-sm text-gray-400">Drop files here or click to browse</p>
          <p className="text-xs text-gray-600 mt-1">PDF, DOCX, DOC, PPTX, PPT, JPG, PNG, WEBP, HTML</p>
        </>
      )}
    </div>
  );
}
