import { useCreateServiceType } from '../api/mutations'
import { CREATE_NEW_SERVICE_TYPE } from '../components/ServiceTypePicker'

// Shared by every form using ServiceTypePicker's "+ Create new type" option:
// resolves the form's service-type value to a real id, creating the
// ServiceType first if the user picked that option. Lets a single submit
// action create the type and the thing that uses it (an event, a
// satisfier) together.
//
// `category` is the picker's own category context, passed per call (the
// batch logger's "Add other…" rows can each be a different component): a
// type created from a picker that knows its category is tagged with it.
// Without one, the new type starts universal.
export function useServiceTypeIdResolver() {
  const createServiceType = useCreateServiceType()

  async function resolveServiceTypeId(serviceTypeId: string, newTypeName: string, category?: string | null): Promise<number> {
    if (serviceTypeId !== CREATE_NEW_SERVICE_TYPE) return Number(serviceTypeId)

    const created = await createServiceType.mutateAsync({
      name: newTypeName.trim(),
      categories: category ? [category] : [],
    })
    return created.id
  }

  return {
    resolveServiceTypeId,
    isCreatingServiceType: createServiceType.isPending,
    createServiceTypeError: createServiceType.error,
  }
}
