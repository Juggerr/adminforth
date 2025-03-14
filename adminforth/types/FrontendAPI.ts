import type { AdminForthFilterOperators } from "./Common.js";

 

export type FilterParams = {
    /**
     * Field of resource to filter
     */
    field: string;
    /**
     * Operator of filter
     */
    operator: AdminForthFilterOperators;
    /**
     * Value of filter
     */
    value: string | number | boolean ;
} 

export interface FrontendAPIInterface {

    /**
     * Show a confirmation dialog
     * 
     * The dialog will be displayed to the user
     * 
     * Example: 
     * 
     * ```ts
     * import adminforth from '@/adminforth'
     * 
     * const isConfirmed = await adminforth.confirm({message: 'Are you sure?', yes: 'Yes', no: 'No'})
     * if (isConfirmed) {
     *  your code...
     * }
     * ```
     * 
     * @param params - The parameters of the dialog
     * @returns A promise that resolves when the user confirms the dialog
     */   
    confirm(params: ConfirmParams): Promise<boolean>;
    
    /**
     * Show an alert
     * 
     * The alert will be displayed to the user
     * 
     * Example:
     * 
     * ```ts
     * import adminforth from '@/adminforth'
     * 
     * adminforth.alert({message: 'Hello', variant: 'success'})
     * ```
     * 
     * @param params - The parameters of the alert
     */
    alert(params:AlertParams): void;


    list: {

        /**
         * Full refresh the list. Loader will be shown during fetching data. Will fully reload table data from the server. If new data available, it will be shown in the list.
         */
        refresh(): Promise<{ error? : string }>;

        /**
         * Silently Refresh existing rows in the list (without loader). 
         * Should be called when table data already loaded, otherwise method will return an error.
         * If new data available, it will not appear in the list.
         */
        silentRefresh(): Promise<{ error? : string }>;

        /**
         * Refresh a specific row in the list without loader, row should be already shown in the list, otherwise method will return an error
         */
        silentRefreshRow (pk: any): Promise<{ error? : string }>;

        /**
         * Close the three dots dropdown
         */
        closeThreeDotsDropdown(): void;


        /**
         * Set a filter in the list
         * Works only when user located on the list page.
         * Can be used to set filter from charts or other components in pageInjections.
         * 
         * Example:
         * 
         * ```ts
         * import adminforth from '@/adminforth'
         * 
         * adminforth.list.setFilter({field: 'name', operator: 'ilike', value: 'john'})
         * ```
         * 
         * @param filter - The filter to set
         */
        setFilter(filter: FilterParams): void;

        /**
         * Update a filter in the list
         * 
         * Example:
         * 
         * ```ts
         * import adminforth from '@/adminforth';
         * 
         * adminforth.list.updateFilter({field: 'name', operator: 'ilike', value: 'john'})
         * ```
         * 
         * @param filter - The filter to update
         */
        updateFilter(filter: FilterParams): void;

        /**
         * Clear all filters from the list
         */
        clearFilters(): void;
    }

    menu: {
        /**
         * Refreshes the badges in the menu, by recalling the badge function for each menu item
         */
        refreshMenuBadges(): void;
    }

    /**
     * Close the user menu dropdown
     */
    closeUserMenuDropdown(): void;
}

export type ConfirmParams = {
    /**
     * The message to display in the dialog
     */
    message?: string;
    /**
     * The text to display in the "accept" button
     */
    yes?: string;
    /**
     * The text to display in the "cancel" button
     */
    no?: string;
   
}

export type AlertParams = {
    /**
     * The message to display in the alert
     */
    message?: string;

    /**
     * The message to display in the alert as HTML (can be used instead of message)
     */
    messageHtml?: string;
    
    /**
     * The variant of the alert
     */
    variant?: AlertVariant | keyof typeof AlertVariant;

    /**
     * The timeout of the alert in seconds or 'unlimited' to keep the alert open until the user closes it.
     * Default is 10 seconds;
     */
    timeout?: number | 'unlimited';
    
}



export enum AlertVariant {
    danger = 'danger',
    success = 'success',
    warning = 'warning',
    info = 'info'
  }

  
  


