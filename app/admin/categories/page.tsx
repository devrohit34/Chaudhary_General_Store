'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Category } from '@/lib/store-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ImagePlus, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', name_hi: '', slug: '', icon: '', image_url: '', description: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  useEffect(() => { fetchCategories(); }, []);

  async function fetchCategories() {
    try {
      const response = await fetch('/api/admin/categories', { cache: 'no-store' });
      if (!response.ok) throw new Error('Categories could not be loaded.');
      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || !('categories' in payload) || !Array.isArray(payload.categories)) {
        throw new Error('Category service returned invalid data.');
      }
      setCategories(payload.categories as Category[]);
    } catch (error) {
      console.error('Admin category load failed:', error instanceof Error ? error.message : 'Unknown error');
      toast.error(error instanceof Error ? error.message : 'Categories could not be loaded.');
    }
  }

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', name_hi: '', slug: '', icon: '', image_url: '', description: '' });
    setLocalPreview(null);
    setUploadProgress(0);
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, name_hi: c.name_hi || '', slug: c.slug, icon: c.icon || '', image_url: c.image_url || '', description: c.description || '' });
    setLocalPreview(null);
    setUploadProgress(0);
    setDialogOpen(true);
  };

  const uploadImage = (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Choose a JPG, JPEG, PNG, or WEBP image.');
      return;
    }
    if (file.size < 1 || file.size > MAX_IMAGE_SIZE) {
      toast.error('Image must be smaller than 5 MB.');
      return;
    }

    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.set('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', '/api/admin/category-images');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      if (request.status < 200 || request.status >= 300) {
        const message = typeof payload === 'object' && payload !== null &&
          'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Category image upload failed. Please try again.';
        finishUpload(new Error(message));
        return;
      }
      if (typeof payload !== 'object' || payload === null ||
          !('url' in payload) || typeof payload.url !== 'string') {
        finishUpload(new Error('Image service returned an invalid response.'));
        return;
      }

      const imageUrl = payload.url;
      setForm((current) => ({ ...current, image_url: imageUrl }));
      setLocalPreview(null);
      setUploadProgress(100);
      finishUpload();
      toast.success('Category image uploaded successfully.');
    };
    request.onerror = () => finishUpload(new Error('Network error while uploading the image. Please try again.'));
    request.onabort = () => finishUpload(new Error('Image upload was canceled.'));
    request.send(formData);
  };

  const finishUpload = (error?: Error) => {
    setUploading(false);
    if (error) {
      console.error('Category image upload failed:', error.message);
      toast.error(error.message);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) uploadImage(file);
  };

  const save = async () => {
    const generatedSlug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { ...form, slug: form.slug || generatedSlug };
    try {
      const response = await fetch(editing ? `/api/admin/categories/${encodeURIComponent(editing.id)}` : '/api/admin/categories', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Category could not be saved.');
      toast.success(editing ? 'Category updated' : 'Category added');
      setDialogOpen(false);
      await fetchCategories();
    } catch (error) {
      console.error('Admin category save failed:', error instanceof Error ? error.message : 'Unknown error');
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Category could not be deleted.');
      toast.success('Deleted');
      await fetchCategories();
    } catch (error) {
      console.error('Admin category delete failed:', error instanceof Error ? error.message : 'Unknown error');
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Categories</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Category</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {categories.map((cat) => (
          <div key={cat.id} className="border rounded-xl p-4 bg-card">
            <div className="text-4xl mb-2">{cat.icon || '🛒'}</div>
            <h3 className="font-semibold">{cat.name}</h3>
            {cat.name_hi && <p className="text-sm text-muted-foreground">{cat.name_hi}</p>}
            <div className="flex gap-1 mt-3">
              <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(cat.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!uploading) setDialogOpen(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Name (Hindi)</Label><Input value={form.name_hi} onChange={(e) => setForm({ ...form, name_hi: e.target.value })} /></div>
            <div><Label>Icon (emoji)</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🛒" /></div>
            <div className="space-y-3">
              <Label htmlFor="category-image-url">Image URL</Label>
              <Input
                id="category-image-url"
                value={form.image_url}
                disabled={uploading}
                onChange={(e) => {
                  setLocalPreview(null);
                  setForm({ ...form, image_url: e.target.value });
                }}
                placeholder="https://example.com/category.jpg"
              />
              {(localPreview || form.image_url) && (
                <div className="relative h-36 w-full max-w-xs overflow-hidden rounded-lg border bg-muted">
                  <Image
                    src={localPreview || form.image_url}
                    alt={`${form.name || 'Category'} preview`}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 320px"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="sr-only"
                  id="category-image-file"
                  aria-label="Upload category image file"
                  disabled={uploading}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={uploading}
                  onClick={() => document.getElementById('category-image-file')?.click()}
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  {uploading ? 'Uploading image…' : form.image_url ? 'Replace image' : 'Upload image'}
                </Button>
                <span className="text-xs text-muted-foreground">JPG, JPEG, PNG, or WEBP · Max 5 MB</span>
              </div>
              {uploading && (
                <div className="space-y-1" role="status" aria-live="polite">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading category image</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" disabled={uploading} onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={uploading} className="flex-1">{editing ? 'Update' : 'Add'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
