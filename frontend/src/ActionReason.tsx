import { createContext, useContext } from 'react';

export const AdminActions = createContext(false);

// Administrative actions retain an action description, not a fabricated explanation.
export function ActionReason({label='Reason / review notes', action='Action recorded without an explanation'}:{label?:string;action?:string}) {
  return useContext(AdminActions)
    ? <input type="hidden" name="reason" value={action}/>
    : <label>{label}<textarea name="reason" required minLength={3} maxLength={300}/></label>;
}
