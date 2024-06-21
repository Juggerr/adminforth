# Custom record field rendering

## Customizing how AdminForth renders the cells with record values

Let's change how AdminForth renders the number of rooms in the 'list' and 'show' views.
We will render '🟨' for each room and then we will print `square_meter` at the same cells.

Create directory `custom`. Create a file `RoomsCell.vue` in it:

```vue
<template>
  <div class="flex items-center">
    <span v-for="room in record.number_of_rooms">
      🟨
    </span>
      
    {{ room.square_meter }} m²
  </div>
</template>

<script setup>
defineProps({
  record: Object
});
</script>
```

Now you can use this component in the configuration of the resource:

```ts
{
  ...
  resourceId: 'apparts',
  ...
  columns: [
    ...
    {
      ...
      name: 'number_of_rooms',
      ...
      components: {
        show: '@@/RoomsCell.vue',
        list: '@@/RoomsCell.vue',
      }
    },
    ...
  ],
  ...
}
```

In very similar way you can render how cell is rendered in `'edit'` and `'create'` view. 
You can use it for creating custom editors for the fields. Check [component specs](/docs/api/types/AdminForthConfig/type-aliases/AdminForthFieldComponents#create) to understand which props are passed to the component