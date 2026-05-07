"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Search, RefreshCw, Upload, Trash2 } from "lucide-react";
import { usePortalDocuments, useDeleteDocument } from "@/hooks/use-portal-documents";
import { DocumentUploadModal } from "@/components/documents/document-upload-modal";
import {
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
} from "@tailfire/ui-public";

const FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'passport', label: 'Passports' },
  { value: 'visa', label: 'Visas' },
  { value: 'travel_insurance', label: 'Insurance' },
  { value: 'trip', label: 'Trip Docs' },
]

const TRIP_DOC_TYPES = ['contract', 'invoice', 'receipt', 'authorization']

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const { data: documents = [], isLoading, isError, refetch } = usePortalDocuments();
  const deleteDocument = useDeleteDocument();

  const filteredDocuments = documents.filter((doc) => {
    // Search filter
    if (searchQuery && !doc.fileName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    // Type filter
    if (activeFilter === 'all') return true;
    if (activeFilter === 'trip') return TRIP_DOC_TYPES.includes(doc.documentType || '');
    return doc.documentType === activeFilter;
  });

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-phoenix-text-muted hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to Dashboard</span>
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-white">Travel Documents</h1>
          </div>
          <p className="text-phoenix-text-muted mt-1 ml-10">
            Manage your travel documents and important files
          </p>
        </div>
        <div className="flex gap-2 ml-10 sm:ml-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-phoenix-text-muted" />
            <Input
              type="search"
              placeholder="Search documents..."
              className="pl-9 bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white w-full sm:w-[200px] lg:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-phoenix-gold px-4 py-2 text-sm font-medium text-white hover:bg-phoenix-gold/90"
          >
            <Upload className="size-4" /> Upload
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mt-4 mb-8 flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveFilter(tab.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeFilter === tab.value
                ? 'bg-phoenix-gold text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full bg-phoenix-charcoal/30 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-3/4 bg-phoenix-charcoal/30" />
                    <Skeleton className="h-3 w-1/2 bg-phoenix-charcoal/30" />
                    <Skeleton className="h-3 w-1/3 bg-phoenix-charcoal/30" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-phoenix-text-muted mb-4" />
          <h3 className="text-xl font-medium text-white">Failed to load documents</h3>
          <p className="text-phoenix-text-muted mt-2 max-w-md mx-auto">
            Something went wrong while loading your documents. Please try again.
          </p>
          <Button
            className="mt-6 btn-phoenix-primary"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      ) : filteredDocuments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => (
            <Card
              key={doc.id}
              className="group relative bg-phoenix-charcoal/50 border-phoenix-gold/30 hover:border-phoenix-gold/50 transition-all"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-phoenix-gold/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-6 w-6 text-phoenix-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate">{doc.fileName}</h3>
                    {doc.documentType && (
                      <p className="text-sm text-phoenix-text-muted mt-1">
                        {doc.documentType}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-phoenix-text-muted">
                      {doc.fileSize != null && doc.fileSize > 0 && (
                        <>
                          <span>{formatFileSize(doc.fileSize)}</span>
                          <span>•</span>
                        </>
                      )}
                      {doc.uploadedAt && <span>Added {formatDate(doc.uploadedAt)}</span>}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-phoenix-gold/30 text-phoenix-gold hover:bg-phoenix-gold/10"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> Download
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
              <button
                onClick={() => {
                  if (confirm('Delete this document?')) {
                    deleteDocument.mutate(doc.id)
                  }
                }}
                className="absolute top-2 right-2 rounded-lg bg-white/80 p-1.5 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-phoenix-text-muted mb-4" />
          <h3 className="text-xl font-medium text-white">No documents found</h3>
          <p className="text-phoenix-text-muted mt-2 max-w-md mx-auto">
            {searchQuery
              ? `No documents matching "${searchQuery}". Try adjusting your search.`
              : activeFilter !== 'all'
              ? `No ${FILTER_TABS.find((t) => t.value === activeFilter)?.label.toLowerCase()} found.`
              : "You don't have any documents yet. Upload one or your advisor will upload documents here as your trip is planned."}
          </p>
          {activeFilter === 'all' && !searchQuery && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-phoenix-gold px-5 py-2.5 text-sm font-medium text-white hover:bg-phoenix-gold/90"
            >
              <Upload className="size-4" /> Upload a Document
            </button>
          )}
        </div>
      )}

      <DocumentUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} />
    </>
  );
}
