import { useCreateServiceType } from '../api/mutations'
import { CREATE_NEW_SERVICE_TYPE } from '../components/ServiceTypeSelect'

// Shared by every form using ServiceTypeSelect's "+ Create new service
// type" option: resolves the form's service-type value to a real id,
// creating the ServiceType first if the user picked that option. Lets a
// single submit action create the type and the thing that uses it (an
// event, a service interval) together -- there's nothing else for the
// user to click in between.
export function useServiceTypeIdResolver() {
  const createServiceType = useCreateServiceType()

  async function resolveServiceTypeId(serviceTypeId: string, newTypeName: string): Promise<number> {
    if (serviceTypeId !== CREATE_NEW_SERVICE_TYPE) return Number(serviceTypeId)

    const created = await createServiceType.mutateAsync({ name: newTypeName.trim() })
    return created.id
  }

  return {
    resolveServiceTypeId,
    isCreatingServiceType: createServiceType.isPending,
    createServiceTypeError: createServiceType.error,
  }
}
