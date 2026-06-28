import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Building, MapPin, Check, Image as ImageIcon } from 'lucide-react'
import { themes, type ThemeName } from '@/lib/themes'
import { AutoBellLogoMark } from '@/components/AutoBellLogo'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useDropzone } from 'react-dropzone'

const settingsSchema = z.object({
  name: z.string().min(2, 'School name is required'),
  campusName: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  themeColor: z.string(),
  themeMode: z.enum(['dark', 'light', 'grey']),
  quietHoursEnabled: z.boolean(),
  quietHoursDisableFrom: z.string(),
  quietHoursEnableAt: z.string(),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

export default function SchoolSettings() {
  const { schoolId, role } = useAuth()
  const queryClient = useQueryClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const canEdit = role === 'admin'

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty }
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: '',
      campusName: '',
      address: '',
      themeColor: 'slate',
      themeMode: 'dark',
      quietHoursEnabled: false,
      quietHoursDisableFrom: '21:00',
      quietHoursEnableAt: '07:00'
    }
  })

  const quietHoursEnabled = watch('quietHoursEnabled')
  const themeColor = watch('themeColor')
  const themeMode = watch('themeMode')

  // Fetch School Data
  const { data: school, isLoading } = useQuery({
    queryKey: ['school_settings', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('name, campus_name, address, logo_url, theme_color, theme_mode, quiet_hours_enabled, quiet_hours_disable_from, quiet_hours_enable_at')
        .eq('id', schoolId)
        .single()
      
      if (error) throw error
      return data
    }
  })

  useEffect(() => {
    if (school) {
      reset({
        name: school.name || '',
        campusName: school.campus_name || '',
        address: school.address || '',
        themeColor: school.theme_color || 'slate',
        themeMode: (school.theme_mode as 'dark' | 'light' | 'grey') || 'dark',
        quietHoursEnabled: !!school.quiet_hours_enabled,
        quietHoursDisableFrom: (school.quiet_hours_disable_from || '21:00').slice(0, 5),
        quietHoursEnableAt: (school.quiet_hours_enable_at || '07:00').slice(0, 5),
      })
      setLogoUrl(school.logo_url)
    }
  }, [school, reset])

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      if (!schoolId || !canEdit) return

      const updates = {
        name: data.name,
        campus_name: data.campusName,
        address: data.address,
        theme_color: data.themeColor,
        theme_mode: data.themeMode,
        quiet_hours_enabled: data.quietHoursEnabled,
        quiet_hours_disable_from: data.quietHoursDisableFrom,
        quiet_hours_enable_at: data.quietHoursEnableAt,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('schools')
        .update(updates)
        .eq('id', schoolId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school_settings', schoolId] })
      queryClient.invalidateQueries({ queryKey: ['school_name', schoolId] })
      queryClient.invalidateQueries({ queryKey: ['school_theme', schoolId] })
      if (canEdit) {
        toast.success('School settings updated successfully!')
      }
      reset({}, { keepValues: true }) // Reset isDirty
    },
    onError: (error) => {
      console.error('Error updating settings:', error)
      toast.error('Failed to update settings.')
    }
  })

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate(data)
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !canEdit) return
    const file = acceptedFiles[0]
    
    const toastId = toast.loading('Uploading logo...')
    try {
      setUploading(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${schoolId}/logo.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('school-branding')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('school-branding')
        .getPublicUrl(fileName)

      const newUrl = `${data.publicUrl}?t=${new Date().getTime()}`
      setLogoUrl(newUrl)
      
      // Update logo_url in db
      await supabase.from('schools').update({ logo_url: newUrl }).eq('id', schoolId)

      toast.success('Logo updated successfully!', { id: toastId })
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast.error('Failed to upload logo.', { id: toastId })
    } finally {
      setUploading(false)
    }
  }, [schoolId, canEdit])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] },
    maxFiles: 1,
    disabled: !canEdit || uploading
  })

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="md:grid md:grid-cols-3 md:gap-6">
        <div className="md:col-span-1">
          <div className="px-4 sm:px-0">
            <h3 className="text-lg font-medium leading-6 text-foreground">School Branding</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your school's identity. This information will be displayed on the Web Dashboard and Mobile App.
            </p>
          </div>
        </div>
        <div className="mt-5 md:mt-0 md:col-span-2">
          <div className="shadow sm:rounded-md sm:overflow-hidden">
            <div className="px-4 py-5 bg-card space-y-6 sm:p-6">
              
              {/* Logo Upload - React Dropzone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">School Logo</label>
                <div 
                  {...getRootProps()} 
                  className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
                    ${isDragActive ? 'border-blue-500 bg-blue-50/10' : 'border-input hover:border-blue-400 bg-background'}`}
                >
                  <input {...getInputProps()} />
                  <div className="space-y-1 text-center flex flex-col items-center">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="mx-auto h-24 w-24 rounded-full object-contain bg-muted border mb-4" />
                    ) : (
                      <div className="mx-auto h-12 w-12 text-muted-foreground mb-2"><ImageIcon className="h-12 w-12" /></div>
                    )}
                    <div className="flex text-sm text-muted-foreground">
                      <span className="relative rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        {uploading ? 'Uploading...' : 'Upload a file'}
                      </span>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 2MB</p>
                  </div>
                </div>
              </div>

              {/* School Name */}
              <div className="grid grid-cols-6 gap-6">
                <div className="col-span-6 sm:col-span-3">
                  <label htmlFor="name" className="block text-sm font-medium text-foreground">School Name</label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                      <Building className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      {...register('name')}
                      className={`focus:ring-blue-500 focus:border-blue-500 flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-input bg-background text-foreground p-2 border ${errors.name ? 'border-red-500' : ''}`}
                      placeholder="Lincoln High School"
                      disabled={!canEdit}
                    />
                  </div>
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>

                <div className="col-span-6 sm:col-span-3">
                  <label htmlFor="campusName" className="block text-sm font-medium text-foreground">Campus Name</label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                      <Building className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      {...register('campusName')}
                      className="focus:ring-blue-500 focus:border-blue-500 flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-input bg-background text-foreground p-2 border"
                      placeholder="Main Campus"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-foreground">Address</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                   <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                      <MapPin className="h-4 w-4" />
                    </span>
                  <input
                    {...register('address')}
                    className={`focus:ring-blue-500 focus:border-blue-500 flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-input bg-background text-foreground p-2 border ${errors.address ? 'border-red-500' : ''}`}
                    placeholder="123 Main St, Springfield"
                    disabled={!canEdit}
                  />
                </div>
                {errors.address ? (
                  <p className="mt-1 text-xs text-red-500">{errors.address.message}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">This will be displayed as the branch or location name.</p>
                )}
              </div>

              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground">Theme Mode</label>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 max-w-md">
                  {['dark', 'light', 'grey'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setValue('themeMode', mode as any, { shouldDirty: true })}
                      disabled={!canEdit}
                      className={`rounded-lg border px-4 py-3 text-left text-sm font-medium shadow-sm disabled:opacity-50 capitalize ${
                        themeMode === mode
                          ? 'border-blue-600 bg-blue-50/10 text-blue-500'
                          : 'border-input bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <label className="block text-sm font-medium text-foreground mt-6">Theme Color</label>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                  {themes.map((theme) => (
                    <div
                      key={theme.name}
                      onClick={() => {
                        if (canEdit) setValue('themeColor', theme.name, { shouldDirty: true })
                      }}
                      className={`
                        relative flex cursor-pointer items-center justify-center rounded-lg border p-4 shadow-sm hover:border-ring focus:outline-none transition-all
                        ${themeColor === theme.name ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/10' : 'bg-background border-input'}
                        ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full ${theme.activeColor} shadow-sm border border-black/10`} />
                        <span className="text-xs font-medium text-foreground">{theme.label}</span>
                      </div>
                      {themeColor === theme.name && (
                        <div className="absolute top-1 right-1">
                          <Check className="h-4 w-4 text-blue-600" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quiet Hours */}
              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-semibold text-foreground">Quiet Hours</h4>
                <p className="mt-1 text-sm text-muted-foreground mb-4">
                  During quiet hours no sound will be played (bell MP3, broadcasts, TTS, voice notes, and tests).
                </p>

                <div className="space-y-4 max-w-md">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('quietHoursEnabled')}
                      className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-500 bg-background"
                      disabled={!canEdit}
                    />
                    Enable quiet hours
                  </label>

                  {quietHoursEnabled && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <label className="block text-sm font-medium text-foreground">Disable from</label>
                        <input
                          type="time"
                          {...register('quietHoursDisableFrom')}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground">Enable at</label>
                        <input
                          type="time"
                          {...register('quietHoursEnableAt')}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
            <div className="px-4 py-3 bg-muted text-right sm:px-6 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {isDirty ? 'You have unsaved changes.' : ''}
              </span>
              <button
                type="submit"
                disabled={!canEdit || updateMutation.isPending || uploading || !isDirty}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
