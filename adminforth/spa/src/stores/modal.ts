import { ref } from 'vue'
import { defineStore } from 'pinia'
import { callAdminForthApi } from '@/utils';


export const useModalStore = defineStore('modal', () => {
  const modalContent = ref({
    title: 'title',
    content: 'content',
    acceptText: 'acceptText',
    cancelText: 'cancelText',
  });  
  const isOpened = ref(false);
  const onAcceptFunction = ref(()=>{});
  function togleModal() {
    isOpened.value = !isOpened.value;
  }
  function setOnAcceptFunction(func) {
    onAcceptFunction.value = func;
  }
  function setModalContent(content) {
    modalContent.value = content;
  }
  function resetmodalState() {
    isOpened.value = false;
    modalContent.value = {
      title: 'title',
      content: 'content',
      acceptText: 'acceptText',
      cancelText: 'cancelText',
    };
    setOnAcceptFunction(()=>{});

  }
    
  return {isOpened, setModalContent, togleModal,modalContent, setOnAcceptFunction, onAcceptFunction,resetmodalState} 
   
})