"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  RefreshCw,
  Pause,
  Play,
  Download,
  PlayCircle,
  ExternalLink,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react"
import { useEffect, Fragment } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { set } from "date-fns"



type TaskStatus = "completed" | "running" | "pending" | "error"

type WorkflowTask = {
  id: string
  name: string
  batchNumber: string
  settlementDate: string
  plannedStartTime: string
  actualStartTime: string | null
  plannedEndTime: string
  actualEndTime: string | null
  status: TaskStatus
  hasDownload: boolean
  filePath?: string
}

type Transaction = {
  id: string
  time: string
  orderId: string
  type: string
  amount: number
  tokenSymbol: string
  amountCNY: number
  merchantId: string
  terminalId: string
  txHash: string
  referenceNumber: string
}

type ApiOrderItem = {
  orderState: string
  offChain: {
    id: number
    transactionTime: string
    referenceNumber: string
    orderState: string
    transactionTypeCode: string
    transactionAmount: number
    merchantId: string
    terminalId: string
    chainTransactionHash: string
    createdAt: string
    tokenSymbol: string
  }
}

type ApiOrderResponse = {
  data: {
    list: ApiOrderItem[]
    pageNum: number
    pageSize: number
    totalNum: number
  }
  statusCode: string
  msg: string
}

type EscrowBalanceRecord = {
  id: string
  time: string
  orderId: string
  type: string
  merchantId: string
  terminalId: string
  userChange: number
  escrowChange: number
  merchantChange: number
  tokenSymbol: string
  txHash: string
}

type CardholderAccount = {
  id: string
  tokenNo: string
  chainType: string
  walletAddress: string
  userName: string
  idNo: string
  phone: string
  extraInfo?: string
  dynamicKeyCreatedAt: string
  dynamicKeyExpired: boolean
}

type MerchantAccount = {
  id: string
  merchantName: string
  merchantId: string
  merchantNumber: string
  merchantAddress: string
}

type CardholderTxRecord = {

  offChain: {
    time: string
    referenceNumber: string
    txHash: string
  }
  userAccountChanges: number
  escrowAccountChanges: number
  merchantAccountChanges: number
  orderState: string
}

type MerchantTxRecord = {
  offChain: {
    time: string
    referenceNumber: string
    merchantId: string
    terminalId: string
    txHash: string
  }
  userAccountChanges: number
  escrowAccountChanges: number
  merchantAccountChanges: number
  orderState: string
}


export default function WorkflowPage() {
  const [workDate, setWorkDate] = useState(formatDateToYYYYMMDD(new Date()))
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  // const [currentPage, setCurrentPage] = useState(1)
  type AccountMode = "fund" | "preauth" | "escrowRecord"
  const [accountMode, setAccountMode] = useState<AccountMode>("fund")


  const [tasks, setTasks] = useState<WorkflowTask[]>([])

  // const [transactions, setTransactions] = useState<Transaction[]>([])
  // const [totalPages, setTotalPages] = useState(1)
  const [filePath, setFilePath] = useState<string>("")
  const pageSize = 5
  const [userAddress, setUserAddress] = useState<string>("0x888...C1D2") // 初始用户地址
  const [balanceList, setBalanceList] = useState<{ tokenSymbol: string; balance: string }[]>([])
  const [escrowBalances, setEscrowBalances] = useState<{ tokenSymbol: string; balance: string }[]>([])
  const [ecUserAddress, setEcUserAddress] = useState<string>("0x888...C1D2") // 初始用户地址
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [detailPage, setDetailPage] = useState(1)
  const [relatedTxMap, setRelatedTxMap] = useState<
    Record<string, Transaction[]>
  >({})
  // 预授权
  const [preAuthPage, setPreAuthPage] = useState(1)
  const [preAuthList, setPreAuthList] = useState<Transaction[]>([])
  const [preAuthTotalPages, setPreAuthTotalPages] = useState(1)

  // 清算
  const [settlePage, setSettlePage] = useState(1)
  const [settleList, setSettleList] = useState<Transaction[]>([])
  const [settleTotalPages, setSettleTotalPages] = useState(1)
  const [escrowRecordPage, setEscrowRecordPage] = useState(1)
  const [escrowRecordList, setEscrowRecordList] = useState<EscrowBalanceRecord[]>([])
  const [escrowRecordTotalPages, setEscrowRecordTotalPages] = useState(1)
  type EscrowAccountType =
    | "cardholder"   // 持卡人 Web3 账户
    | "contract"     // 预授权智能合约账户
    | "merchant"     // 商户账户

  const [escrowAccountType, setEscrowAccountType] = useState<EscrowAccountType>("cardholder")
  // 托管账户列表
  const [cardholderAccountList, setCardholderAccountList] = useState<CardholderAccount[]>([])
  const [merchantAccountList, setMerchantAccountList] = useState<MerchantAccount[]>([])

  // 交易明细弹窗
  const [txDetailOpen, setTxDetailOpen] = useState(false)
  const [txDetailList, setTxDetailList] = useState<CardholderTxRecord[] | MerchantTxRecord[]>([])
  const [txDetailTitle, setTxDetailTitle] = useState("")
  const [currentAccountAddress, setCurrentAccountAddress] = useState<string>("")
  const [currentTokenNo, setCurrentTokenNo] = useState<string>("")
  type TxDetailType = "cardholder" | "merchant"

  const [txDetailType, setTxDetailType] = useState<TxDetailType | null>(null)

  const pagedTxList = useMemo(() => {
    const start = (detailPage - 1) * pageSize
    return txDetailList.slice(start, start + pageSize)
  }, [txDetailList, detailPage])
  const transactions =
    accountMode === "preauth"
      ? preAuthList
      : settleList

  const currentPage =
    accountMode === "preauth"
      ? preAuthPage
      : settlePage

  const totalPages =
    accountMode === "preauth"
      ? preAuthTotalPages
      : settleTotalPages



  const fetchBalance = async () => {
    try {
      const res = await fetch("http://172.20.10.6:8088/admin/getBalance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "*/*",
        },
        body: JSON.stringify({
          primaryAccountNumber: '625807******4153',
        }), // 和 curl -d '' 一致
      })
      const data = await res.json()
      console.log("getBalance response:", data)
      if (data.statusCode === "00") {
        const rawList = Array.isArray(data.data)
          ? data.data
          : data.data
            ? [data.data]
            : []
        const balances = rawList
          .filter((item: any) => item && item.tokenSymbol && item.balance)
          .map((item: any) => ({
            tokenSymbol: item.tokenSymbol,
            balance: item.balance,
          }))
        setBalanceList(balances)

        setUserAddress(
          rawList.find((item: any) => item?.userAddress)?.userAddress ||
          "0x888...C1D2"
        )
        // const balances = data.data.map((item: any) => ({
        //   tokenSymbol: item.tokenSymbol,
        //   balance: item.balance,
        // }))

        // setBalanceList(balances)
        // setUserAddress(data.data[0].userAddress || "0x888...C1D2") // 获取用户地址
      } else {
        console.log("获取余额失败，请稍后重试")
      }
    } catch (error) {
      console.error("获取余额失败", error)
    }
  }
  const fetchEscrowBalance = async () => {
    const res = await fetch("http://172.20.10.6:8088/api/operator/escrowBalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const data = await res.json()
    // if (json.statusCode !== "00") return
    console.log("预授权余额:", data)
    // setEscrowBalances(json.data)
    if (data.statusCode === "00") {
      const rawList = Array.isArray(data.data)
        ? data.data
        : data.data
          ? [data.data]
          : []
      const balances = rawList
        .filter((item: any) => item && item.tokenSymbol && item.balance)
        .map((item: any) => ({
          tokenSymbol: item.tokenSymbol,
          balance: item.balance,
        }))
      setEscrowBalances(balances)
      console.log("预授权余额列表:", balances)
      setEcUserAddress(
        rawList.find((item: any) => item?.userAddress)?.userAddress ||
        "0x888...C1D2"
      )
    }
  }

  useEffect(() => {
    if (accountMode === "fund") {
      fetchBalance()
      fetchTransactions(1)
    } else if (accountMode === "preauth") {
      fetchEscrowBalance()
      fetchPreAuthTransactions(1)
    } else if (accountMode === "escrowRecord") {
      //fetchEscrowBalance()
      fetchEscrowBalanceRecords(1)
    }
  }, [accountMode])

  useEffect(() => {
    console.log("关联交易列表更新:", relatedTxMap)
  }, [relatedTxMap])

  useEffect(() => {
    if (accountMode !== "escrowRecord") return

    if (escrowAccountType === "cardholder") {
      fetchCardholderAccountList() // 接口 A
    } else if (escrowAccountType === "contract") {
      fetchEscrowBalanceRecords(1) // 接口 B（你已有）
    } else if (escrowAccountType === "merchant") {
      fetchMerchantAccountList() // 接口 C
    }
  }, [accountMode, escrowAccountType])

  const fetchCardholderAccountList = async () => {
    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryUserList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNum: 1,
          pageSize: 10,
        }),
      }
    )

    const json = await res.json()
    if (json.statusCode !== "00") return

    const list: CardholderAccount[] = json.data.list.map((item: any) => ({
      id: item.cardToken,
      tokenNo: item.cardToken,
      chainType: item.chainName,
      walletAddress: item.chainWalletAddress,
      userName: item.userName,
      idNo: item.idNumber,
      phone: item.mobileNo,
      extraInfo: item.userOtherInfo,
      dynamicKeyCreatedAt: item.dynamicKeyCreatedAt,
      dynamicKeyExpired: item.dynamicKeyExpired,
    }))

    setCardholderAccountList(list)
  }
  const fetchMerchantAccountList = async () => {
    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryMerchantList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNum: 1,
          pageSize: 10,
        }),
      }
    )

    const json = await res.json()
    if (json.statusCode !== "00") return

    const list: MerchantAccount[] = json.data.map((item: any) => ({
      id: String(item.merchantId),
      merchantName: item.merchantName,
      merchantId: item.merchantId,
      merchantNumber: item.merchantNumber,
      merchantAddress: item.merchantAddress,
    }))

    setMerchantAccountList(list)
  }

  const fetchPreAuthTransactions = async (page: number) => {
    const res = await fetch("http://172.20.10.6:8088/admin/queryPreAuthList", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageNum: page, pageSize }),
    })

    // const json = await res.json()
    // if (json.statusCode !== "00") return

    // const list = json.data.list.map((item: any) => ({
    //   ...item.offChain,
    //   orderState: item.orderState,
    // }))

    const result: ApiOrderResponse = await res.json()

    if (result.statusCode !== "00") return

    const list: Transaction[] = result.data.list.map((item) => {
      const off = item.offChain

      return {
        id: String(off.id),
        time: off.createdAt,
        orderId: off.referenceNumber,
        type: item.orderState,
        amount: off.transactionAmount,
        amountCNY: Number((off.transactionAmount * 7.06).toFixed(2)),
        merchantId: off.merchantId || "--",
        terminalId: off.terminalId || "--",
        txHash: off.chainTransactionHash,
        tokenSymbol: off.tokenSymbol || "USDC",
        referenceNumber: off.referenceNumber,
      }
    })
    setPreAuthList(list)
    setPreAuthTotalPages(Math.ceil(result.data.totalNum / pageSize))
  }
  const fetchPreAuthLink = async (id: string, referenceNumber: string) => {
    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryPreAuthLink",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber }),
      }
    )

    const json = await res.json()
    console.log("关联交易响应:", json)

    if (json.statusCode === "00") {
      const list: Transaction[] = json.data.map((item: any) => {
        const off = item.offChain

        return {
          id: String(off.id), // ✅ 唯一
          time: off.createdAt,
          orderId: off.referenceNumber,
          type: item.orderState,
          amount: off.transactionAmount,
          amountCNY: Number((off.transactionAmount * 7.06).toFixed(2)),
          merchantId: off.merchantId || "--",
          terminalId: off.terminalId || "--",
          txHash: off.chainTransactionHash,
          tokenSymbol: off.tokenSymbol || "USDT",
          referenceNumber: off.referenceNumber,
        }
      })

      setRelatedTxMap((prev) => ({
        ...prev,
        [id]: list,
      }))
    }
  }

  const fetchEscrowBalanceRecords = async (page: number) => {
    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryPreAuthBalance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNum: page,
          pageSize,
        }),
      }
    )

    const result = await res.json()
    if (result.statusCode !== "00") return

    const list: EscrowBalanceRecord[] = result.data.list.map((item: any) => {
      const off = item.offChain
      return {
        id: off.referenceNumber + off.createdAt,
        time: off.createdAt,
        orderId: off.referenceNumber,
        type: item.orderState,
        merchantId: off.merchantId,
        terminalId: off.terminalId,
        userChange: item.userAccountChanges,
        escrowChange: item.escrowAccountChanges,
        merchantChange: item.merchantAccountChanges,
        tokenSymbol: off.tokenSymbol,
        txHash: off.chainTransactionHash,
      }
    })

    setEscrowRecordList(list)
    setEscrowRecordTotalPages(
      Math.ceil(result.data.totalNum / pageSize)
    )
  }
  const handleViewCardholderTxDetail = async (item: CardholderAccount) => {
    setTxDetailOpen(true)
    setTxDetailTitle("持卡人账户交易明细")
    setTxDetailList([])
    setTxDetailType("cardholder")
    setCurrentAccountAddress(item.walletAddress)
    setCurrentTokenNo(item.tokenNo)
    setDetailPage(1)

    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryUserBalance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNum: 1,
          pageSize: 10,
          cardToken: item.tokenNo,
        }),
      }
    )

    const json = await res.json()
    if (json.statusCode !== "00") return

    const list: CardholderTxRecord[] = json.data.list.map((tx: any) => ({
      userAccountChanges: tx.userAccountChanges,
      orderState: tx.orderState,
      offChain: {
        time: tx.offChain.createdAt,
        referenceNumber: tx.offChain.referenceNumber,
        txHash: tx.offChain.chainTransactionHash,
      }
    }))

    setTxDetailList(list)
  }
  const handleViewMerchantTxDetail = async (item: MerchantAccount) => {
    setTxDetailOpen(true)
    setTxDetailTitle("商户账户交易明细")
    setTxDetailList([])
    setTxDetailType("merchant")
    setDetailPage(1)

    const res = await fetch(
      "http://172.20.10.6:8088/admin/queryMerchantBalance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: item.merchantId,
          pageNum: 1,
          pageSize: 10,
        }),
      }
    )

    const json = await res.json()
    if (json.statusCode !== "00") return

    const list: MerchantTxRecord[] = json.data.list.map((tx: any) => ({
      merchantAccountChanges: tx.merchantAccountChanges,
      orderState: tx.orderState,
      offChain: {
        time: tx.offChain.createdAt,
        referenceNumber: tx.offChain.referenceNumber,
        merchantId: tx.offChain.merchantId,
        terminalId: tx.offChain.terminalId,
        txHash: tx.offChain.chainTransactionHash,

      }
    }))

    setTxDetailList(list)
  }


  function formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份是从0开始的，所以要加1
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

  const shortenHash = (hash: string, start = 6, end = 6) => {
    if (!hash) return "--"
    if (hash.length <= start + end) return hash
    return `${hash.slice(0, start)}...${hash.slice(-end)}`
  }

  const handleBatchExecute = async () => {
    try {
      // ① 调接口 A
      const res = await fetch(
        "http://172.20.10.6:8088/settleTask/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settleDt: workDate,
            jobNo: 0,
          }),
        }
      )

      const result = await res.json()
      await sleep(1000)
      if (result.statusCode !== "00") {
        setTasks([])
        return
      }

      const list: WorkflowTask[] = result.data.map((item: any) => ({
        id: String(item.id),
        name: item.jobName,
        batchNumber: String(item.jobCode),
        settlementDate: `${item.settleDt.slice(0, 4)}/${item.settleDt.slice(4, 6)}/${item.settleDt.slice(6, 8)}`,
        plannedStartTime: item.planStartTime,
        actualStartTime: item.realStartTime ?? null,
        plannedEndTime: item.planEndTime,
        actualEndTime: item.realEndTime ?? null,
        status: mapTaskStatus(item.status),
        hasDownload: Boolean(item.filePath),
        filePath: item.filePath ? item.filePath : "",
      }))

      setTasks(list)
      const jobList: { jobNo: number; state: number }[] = result.data

      // ② 按顺序串行执行
      for (let i = 0; i < 5; i++) {
        const success = await handleStepExecute(
          workDate,
          i + ""
        )
        await sleep(1000) // 每步间隔 1 秒
        fetchWorkflowTasks(workDate)
        // ❗ 如果你希望“失败就中断”
        if (!success) {
          console.warn(`作业 ${i} 执行失败，停止后续执行`)
          break
        }
      }

      // ③ 最终刷新一次（强烈建议）
      //fetchWorkflowTasks(workDate)
    } catch (error) {
      console.error("场次执行失败", error)
    }
  }
  // 页面加载时，获取余额
  useEffect(() => {
    fetchBalance()
  }, [])
  useEffect(() => {
    fetchPreAuthTransactions(preAuthPage)
  }, [preAuthPage])

  useEffect(() => {
    fetchTransactions(settlePage)
  }, [settlePage])
  const handleRefresh = () => {
    setLastRefreshTime(new Date())
  }
  useEffect(() => {
    fetchWorkflowTasks(workDate)
  }, [])

  useEffect(() => {
    setExpandedOrder(null)
  }, [accountMode, preAuthPage])
  const handleWorkDateChange = (newDate: string) => {
    setWorkDate(newDate)
    //const formattedDate = `${newDate.slice(0, 4)}/${newDate.slice(4, 6)}/${newDate.slice(6, 8)}`
    //setTasks(tasks.map((task) => ({ ...task, settlementDate: formattedDate })))
    fetchWorkflowTasks(newDate)
  }

  const handlePauseResume = () => {
    setIsPaused(!isPaused)
  }

  const handleStepExecute = async (
    settle_dt: string,
    batchNo: string
  ): Promise<boolean> => {
    const settleDt = settle_dt.replaceAll("/", "")
    // ① 先把当前任务状态改为【执行中】
    setTasks((prev) =>
      prev.map((task) =>
        task.batchNumber === batchNo
          ? { ...task, status: "running" }
          : task
      )
    )

    try {
      const res = await fetch(
        // "http://127.0.0.1:4523/m1/7468733-7203316-default/settleTask/run",
        "http://172.20.10.6:8088/settleTask/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            settleDt,
            jobNo: Number(batchNo),
          }),
        }
      )

      const result = await res.json()
      fetchWorkflowTasks(workDate)
      if (result.statusCode === "00") {
        // ② 执行成功 → 更新为成功
        setTasks((prev) =>
          prev.map((task) =>
            task.batchNumber === batchNo
              ? { ...task, status: "completed" }
              : task
          )
        )
        return true
      } else {
        // ③ 执行失败 → 更新为失败
        setTasks((prev) =>
          prev.map((task) =>
            task.batchNumber === batchNo
              ? { ...task, status: "error" }
              : task
          )
        )
        return false
      }
    } catch (error) {
      console.error("单步执行失败", error)

      // 网络 / 异常情况 → 标记失败
      setTasks((prev) =>
        prev.map((task) =>
          task.batchNumber === batchNo
            ? { ...task, status: "error" }
            : task
        )
      )
      return false
    } finally {
      // ④ 最终以“后端为准”刷新一次任务列表（强烈建议）
      // fetchWorkflowTasks(settle_dt)
    }
  }

  const handleDownload = async (taskName: string, location: string) => {
    try {
      const res = await fetch(
        "http://172.20.10.6:8088/file/downloadMultiple",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            location,
          }),
        }
      )

      if (!res.ok) {
        throw new Error("文件下载失败")
      }

      // 1️⃣ 读取文件流
      const blob = await res.blob()

      // 2️⃣ 从 header 中解析文件名
      const disposition = res.headers.get("Content-Disposition")
      let fileName = `${taskName}`

      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/)
        if (match) {
          fileName = decodeURIComponent(match[1] || match[2])
        }
      }

      // 3️⃣ 创建下载链接
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()

      // 4️⃣ 清理
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("文件下载异常", error)
      alert("文件下载失败，请稍后重试")
    }
  }



  // const handleCopy = async (text: string, field: string) => {

  //   try {

  //     await navigator.clipboard.writeText(text)

  //     setCopiedField(field)

  //     setTimeout(() => setCopiedField(null), 2000)

  //   } catch (error) {

  //     console.error("[v0] Failed to copy:", error)

  //   }

  // }

  const getStatusBadge = (status: TaskStatus) => {
    const statusConfig = {
      completed: { label: "已完成", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
      running: { label: "执行中", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
      pending: { label: "待执行", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
      error: { label: "异常", className: "bg-red-500/10 text-red-600 border-red-500/20" },
    }
    const config = statusConfig[status]
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    )
  }
  const fetchTransactions = async (page: number) => {
    try {
      const res = await fetch(
        "http://172.20.10.6:8088/admin/queryOrderList",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageNum: page,
            pageSize,
          }),
        }
      )

      const result: ApiOrderResponse = await res.json()

      if (result.statusCode !== "00") return

      const list: Transaction[] = result.data.list.map((item) => {
        const off = item.offChain

        return {
          id: String(off.id),
          time: off.createdAt,
          orderId: off.referenceNumber,
          type: item.orderState,
          amount: off.transactionAmount,
          amountCNY: Number((off.transactionAmount * 7.06).toFixed(2)),
          merchantId: off.merchantId || "--",
          terminalId: off.terminalId || "--",
          txHash: off.chainTransactionHash,
          tokenSymbol: off.tokenSymbol || "USDC",
          referenceNumber: off.referenceNumber,
        }
      })

      setSettleList(list)
      console.log("交易列表：", list)
      setSettleTotalPages(Math.ceil(result.data.totalNum / pageSize))
    } catch (error) {
      console.error("查询交易列表失败", error)
    }
  }
  const fetchWorkflowTasks = async (settleDt: string) => {
    const res = await fetch(
      //"http://127.0.0.1:4523/m1/7468733-7203316-default/settleTask/tasks",
      "http://172.20.10.6:8088/settleTask/tasks",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settleDt: settleDt,
          jobNo: 0
        }),
      }
    )

    const json = await res.json()

    if (json.statusCode !== "00") {
      setTasks([])
      return
    }

    const list: WorkflowTask[] = json.data.map((item: any) => ({
      id: String(item.id),
      name: item.jobName,
      batchNumber: String(item.jobCode),
      settlementDate: `${item.settleDt.slice(0, 4)}/${item.settleDt.slice(4, 6)}/${item.settleDt.slice(6, 8)}`,
      plannedStartTime: item.planStartTime,
      actualStartTime: item.realStartTime ?? null,
      plannedEndTime: item.planEndTime,
      actualEndTime: item.realEndTime ?? null,
      status: mapTaskStatus(item.status + ""),
      hasDownload: Boolean(item.filePath),
      filePath: item.filePath ? item.filePath : "",
    }))

    setTasks(list)
  }
  const mapTaskStatus = (status: string): TaskStatus => {
    switch (status) {
      case "2":
        return "completed"
      case "1":
        return "running"
      case "0":
        return "pending"
      case "3":
        return "error"
      default:
        return "pending"
    }
  }

  const formatTime = (time: string | null) => {
    return time || <span className="text-muted-foreground">--</span>
  }

  function RelatedTxTable({ list }: { list: Transaction[] }) {
    if (!list.length) {
      return (
        <div className="text-sm text-slate-500">
          暂无关联交易
        </div>
      )
    }

    return (
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-3 py-2 text-left">时间</th>
            <th className="px-3 py-2 text-left">订单号</th>
            <th className="px-3 py-2 text-left">交易类型</th>
            <th className="px-3 py-2 text-left">金额</th>
            <th className="px-3 py-2 text-left">区块链交易详情</th>
          </tr>
        </thead>
        <tbody>
          {list.map((tx) => (
            <tr key={tx.id} className="border-t">
              <td className="px-3 py-2 font-mono">
                {tx.time}
              </td>
              <td className="px-3 py-2">
                {tx.orderId}
              </td>
              <td className="px-3 py-2 ">
                {tx.type}
              </td>
              <td className="px-3 py-2 font-semibold">
                {tx.amount} {tx.tokenSymbol}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-blue-600">
                <a
                  href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                  <span className="font-mono text-xs">
                    {shortenHash(tx.txHash)}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  function EscrowBalanceTable({ list }: { list: EscrowBalanceRecord[] }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>订单号</TableHead>
            <TableHead>交易类型</TableHead>
            <TableHead>用户账户变动</TableHead>
            <TableHead>托管账户变动</TableHead>
            <TableHead>商户账户变动</TableHead>
            <TableHead>区块链交易详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="font-mono text-xs">{tx.time}</TableCell>
              <TableCell>{tx.orderId}</TableCell>
              <TableCell>{tx.type}</TableCell>

              <TableCell className={tx.userChange > 0
                ? "text-emerald-600"
                : tx.userChange < 0
                  ? "text-red-600"
                  : ""}>
                {tx.userChange} {tx.tokenSymbol}
              </TableCell>

              <TableCell className={tx.escrowChange > 0
                ? "text-emerald-600"
                : tx.escrowChange < 0
                  ? "text-red-600"
                  : ""}>
                {tx.escrowChange} {tx.tokenSymbol}
              </TableCell>

              <TableCell className={tx.merchantChange >= 0 ? "text-emerald-600" : "text-red-600"}>
                {tx.merchantChange} {tx.tokenSymbol}
              </TableCell>

              <TableCell>
                <a
                  href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600"
                >
                  <span className="font-mono text-xs">
                    {shortenHash(tx.txHash)}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  function CardholderAccountTable({
    list,
    onViewDetail,
  }: {
    list: CardholderAccount[]
    onViewDetail: (item: CardholderAccount) => void
  }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>卡 TOKEN 号</TableHead>
            <TableHead>区块链类型</TableHead>
            <TableHead>账户地址</TableHead>
            <TableHead>动态密钥创建时间</TableHead>
            <TableHead>动态密钥是否过期</TableHead>
            <TableHead>用户姓名</TableHead>
            <TableHead>身份证号</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>交易详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.tokenNo}</TableCell>
              <TableCell>{item.chainType}</TableCell>
              <TableCell className="font-mono text-xs">
                {shortenHash(item.walletAddress)}
              </TableCell>
              <TableCell>{item.dynamicKeyCreatedAt}</TableCell>
              <TableCell className={item.dynamicKeyExpired ? "text-red-600" : ""}>{item.dynamicKeyExpired ? "已过期" : "未过期"}</TableCell>
              <TableCell>{item.userName}</TableCell>
              <TableCell>{item.idNo}</TableCell>
              <TableCell>{item.phone}</TableCell>

              <TableCell>
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => onViewDetail(item)}
                >
                  查看交易详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  function MerchantAccountTable({
    list,
    onViewDetail,
  }: {
    list: MerchantAccount[]
    onViewDetail: (item: MerchantAccount) => void
  }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>商户名称</TableHead>
            <TableHead>商户号</TableHead>
            <TableHead>商户联系方式</TableHead>
            <TableHead>商户地址</TableHead>
            <TableHead>交易详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.merchantName}</TableCell>
              <TableCell className="font-mono">{m.merchantId}</TableCell>
              <TableCell>{m.merchantNumber || "--"}</TableCell>
              <TableCell>{m.merchantAddress || "--"}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => onViewDetail(m)}
                >
                  查看交易详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  function CardholderTxTable({
    list,
    accountAddress,
  }: {
    list: CardholderTxRecord[]
    accountAddress: string
  }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>卡token</TableHead>
            <TableHead>账户地址</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>订单号</TableHead>
            <TableHead>交易类型</TableHead>
            <TableHead>账户余额变动</TableHead>
            <TableHead>区块链交易详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((tx) => (
            <TableRow key={tx.offChain.txHash + "-" + tx.offChain.referenceNumber}>
              <TableCell>{currentTokenNo}</TableCell>
              <TableCell className="font-mono text-xs">
                {shortenHash(accountAddress)}
              </TableCell>
              <TableCell>{tx.offChain.time}</TableCell>
              <TableCell>{tx.offChain.referenceNumber}</TableCell>
              <TableCell>{tx.orderState}</TableCell>
              <TableCell
                className={tx.userAccountChanges > 0 ? "text-emerald-600" : tx.userAccountChanges < 0 ? "text-red-600" : ""}
              >
                {tx.userAccountChanges}
              </TableCell>
              <TableCell>
                <a
                  href={`https://sepolia.etherscan.io/tx/${tx.offChain.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortenHash(tx.offChain.txHash)}
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  function MerchantTxTable({
    list,
  }: {
    list: MerchantTxRecord[]
  }) {
    if (!list.length) {
      return (
        <div className="text-sm text-slate-500 py-6 text-center">
          暂无交易记录
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>订单号</TableHead>
            <TableHead>交易类型</TableHead>
            <TableHead>账户余额变动</TableHead>
            <TableHead>区块链交易详情</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {list.map((tx) => (
            <TableRow key={tx.offChain.txHash + "-" + tx.offChain.referenceNumber}>
              <TableCell className="font-mono text-xs">
                {tx.offChain.time}
              </TableCell>

              <TableCell>{tx.offChain.referenceNumber}</TableCell>

              <TableCell>{tx.orderState}</TableCell>

              <TableCell
                className={
                  tx.merchantAccountChanges > 0
                    ? "text-emerald-600"
                    : tx.merchantAccountChanges < 0
                      ? "text-red-600"
                      : ""
                }
              >
                ${tx.merchantAccountChanges}
              </TableCell>

              <TableCell>
                <a
                  href={`https://sepolia.etherscan.io/tx/${tx.offChain.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                  <span className="font-mono text-xs">
                    {shortenHash(tx.offChain.txHash)}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }



  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">稳定币交易运营平台</h1>
        </div>

        <Card className="mb-8 bg-white shadow-sm border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">稳定币交易流水</h2>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={accountMode === "fund" ? "default" : "outline"}
                  onClick={() => setAccountMode("fund")}
                >
                  普通消费查询
                </Button>

                <Button
                  size="sm"
                  variant={accountMode === "preauth" ? "default" : "outline"}
                  onClick={() => setAccountMode("preauth")}
                >
                  预授权消费查询
                </Button>

                <Button
                  size="sm"
                  variant={accountMode === "escrowRecord" ? "default" : "outline"}
                  onClick={() => setAccountMode("escrowRecord")}
                >
                  托管账户查询
                </Button>
              </div>

            </div>

          </div>

          {/* ================= 页面主体 ================= */}
          <div className="container mx-auto px-4 py-6">

            {/* ================= 根据 accountMode 切换布局 ================= */}
            {accountMode === "escrowRecord" ? (
              /* =========================================================
                 ✅ 托管账户：全宽布局（无左侧余额）
              ========================================================= */
              <div className="w-full">

                {/* ---------- 标题 + 账户类型切换 ---------- */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-medium text-slate-700">
                    交易历史记录
                  </h3>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">账户类型：</span>
                    <select
                      className="border rounded px-3 py-1 text-sm"
                      value={escrowAccountType}
                      onChange={(e) =>
                        setEscrowAccountType(e.target.value as EscrowAccountType)
                      }
                    >
                      <option value="cardholder">持卡人 Web3 账户</option>
                      <option value="contract">预授权智能合约账户</option>
                      <option value="merchant">商户账户</option>
                    </select>
                  </div>
                </div>

                {/* ---------- 全宽表格 ---------- */}
                <div className="border rounded-lg overflow-x-hidden">
                  {escrowAccountType === "cardholder" && (
                    <CardholderAccountTable
                      list={cardholderAccountList}
                      onViewDetail={handleViewCardholderTxDetail}
                    />
                  )}

                  {escrowAccountType === "contract" && (
                    <EscrowBalanceTable list={escrowRecordList} />
                  )}

                  {escrowAccountType === "merchant" && (
                    <MerchantAccountTable
                      list={merchantAccountList}
                      onViewDetail={handleViewMerchantTxDetail}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* =========================================================
                 ✅ 其他模式：左右布局（左余额 + 右表格）
              ========================================================= */
              <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6">

                {/* ================= 左侧：余额卡片 ================= */}
                <div>
                  <Card className="p-3 border-2">
                    <div className="text-xs text-slate-600 mb-2">
                      {accountMode === "fund" ? "清算账户" : "预授权托管账户"}
                    </div>

                    <div className="text-xs text-slate-500 mb-1">余额</div>

                    {(accountMode === "fund" ? balanceList : escrowBalances).map(
                      (item, idx) => (
                        <div key={idx} className="mb-2">
                          <span className="text-xs font-bold">
                            {item.balance} {item.tokenSymbol}
                          </span>
                        </div>
                      )
                    )}

                    <div className="text-xs text-slate-500 mt-3 mb-1">
                      账户地址
                    </div>
                    <div className="text-xs font-mono break-all">
                      {accountMode === "fund"
                        ? userAddress
                        : ecUserAddress || "--"}
                    </div>
                  </Card>
                </div>

                {/* ================= 右侧：交易表格 ================= */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-medium text-slate-700">
                      交易历史记录
                    </h3>
                  </div>

                  <div className="border rounded-lg overflow-x-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead>时间</TableHead>
                          <TableHead>订单号</TableHead>
                          <TableHead>交易类型</TableHead>
                          <TableHead>商户号</TableHead>
                          <TableHead>终端号</TableHead>
                          <TableHead>用户付款金额</TableHead>
                          <TableHead>区块链交易详情</TableHead>
                          {accountMode === "preauth" && (
                            <TableHead>操作</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {transactions.map((tx) => (
                          <Fragment key={tx.id}>
                            {/* ---------- 主交易行 ---------- */}
                            <TableRow className="hover:bg-slate-50/50">
                              <TableCell className="font-mono text-xs whitespace-nowrap">
                                {tx.time}
                              </TableCell>
                              <TableCell>{tx.orderId}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {tx.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {tx.merchantId}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {tx.terminalId}
                              </TableCell>
                              <TableCell className="font-semibold text-blue-600">
                                {tx.amount} {tx.tokenSymbol}
                              </TableCell>
                              <TableCell>
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600"
                                >
                                  <span className="font-mono text-xs">
                                    {shortenHash(tx.txHash)}
                                  </span>
                                  <ExternalLink className="size-3" />
                                </a>
                              </TableCell>

                              {accountMode === "preauth" && (
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="link"
                                    onClick={() => {
                                      setExpandedOrder(
                                        expandedOrder === tx.id ? null : tx.id
                                      )
                                      fetchPreAuthLink(tx.id, tx.referenceNumber)
                                    }}
                                  >
                                    {expandedOrder === tx.id
                                      ? "收起"
                                      : "查看关联交易"}
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>

                            {/* ---------- 展开行 ---------- */}
                            {accountMode === "preauth" &&
                              expandedOrder === tx.id && (
                                <TableRow className="bg-slate-50">
                                  <TableCell colSpan={8}>
                                    <RelatedTxTable
                                      list={relatedTxMap[tx.id] || []}
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>

        </Card>

        <Card className="bg-white shadow-sm border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">稳定币清结算工作流</h2>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>系统刷新时间：</span>
                <span className="font-mono text-slate-700">
                  {lastRefreshTime.toLocaleTimeString("zh-CN", { hour12: false })}
                </span>
              </div>

            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="work-date" className="text-sm font-medium text-slate-700">
                  当前工作日期
                </label>
                <Input
                  id="work-date"
                  type="text"
                  value={workDate}
                  onChange={(e) => handleWorkDateChange(e.target.value)}
                  className="w-40 font-mono"
                  placeholder="YYYYMMDD"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleBatchExecute} // 你的场次执行函数
                >
                  场次执行
                </Button>
              </div>
              {/* <div className="flex gap-3 ml-auto">
                <Button onClick={handleRefresh} variant="outline" className="gap-2 bg-transparent">
                  <RefreshCw className="size-4" />
                  手动刷新
                </Button>
                <Button onClick={handlePauseResume} variant={isPaused ? "default" : "outline"} className="gap-2">
                  <Pause className="size-4" />
                  暂停执行
                </Button>
                <Button onClick={handlePauseResume} variant={isPaused ? "outline" : "default"} className="gap-2">
                  <Play className="size-4" />
                  继续执行
                </Button>
              </div> */}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-semibold text-slate-700 w-[240px] pl-12">作业名称</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[100px]">作业号</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">请求清算日</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">计划执行时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">实际执行时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">计划结束时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">实际结束时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">操作与状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900 pl-12">{task.name}</TableCell>
                    <TableCell className="font-mono text-sm">{task.batchNumber}</TableCell>
                    <TableCell className="text-sm">{task.settlementDate}</TableCell>
                    <TableCell className="font-mono text-sm">{task.plannedStartTime}</TableCell>
                    <TableCell className="font-mono text-sm">{formatTime(task.actualStartTime)}</TableCell>
                    <TableCell className="font-mono text-sm">{task.plannedEndTime}</TableCell>
                    <TableCell className="font-mono text-sm">{formatTime(task.actualEndTime)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {getStatusBadge(task.status)}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => handleStepExecute(task.settlementDate, task.batchNumber)}
                        >
                          <PlayCircle className="size-3.5" />
                          单步操作
                        </Button>
                        {task.hasDownload && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleDownload(task.name, task.filePath ? task.filePath : "")}
                          >
                            <Download className="size-3.5" />
                            文件下载
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <Dialog open={txDetailOpen} onOpenChange={setTxDetailOpen}>
          <DialogContent className="w-max max-w-[95vw] min-w-[1000px]">
            <DialogHeader>
              <DialogTitle>{txDetailTitle}</DialogTitle>
            </DialogHeader>

            {/* ====== 交易明细表格（分页数据） ====== */}
            {txDetailType === "cardholder" ? (
              <CardholderTxTable
                list={pagedTxList as CardholderTxRecord[]}
                accountAddress={currentAccountAddress}
              />
            ) : (
              <MerchantTxTable
                list={pagedTxList as MerchantTxRecord[]}
              />
            )}

            {/* ====== 分页控件 ====== */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-600">
                共 {txDetailList.length} 条，
                第 {detailPage} / {Math.ceil(txDetailList.length / pageSize)} 页
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detailPage === 1}
                  onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    detailPage >=
                    Math.ceil(txDetailList.length / pageSize)
                  }
                  onClick={() =>
                    setDetailPage((p) =>
                      Math.min(
                        Math.ceil(txDetailList.length / pageSize),
                        p + 1
                      )
                    )
                  }
                >
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>

    </div>
  )
}
